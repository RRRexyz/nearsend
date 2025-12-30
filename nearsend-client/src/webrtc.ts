import { Socket } from "socket.io-client";

interface SignalPayload {
    type: "offer" | "answer" | "ice";
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

export class WebRTCManager {
    socket: Socket;
    peerConnections: Map<string, RTCPeerConnection> = new Map();
    dataChannels: Map<string, RTCDataChannel> = new Map();
    onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;

    constructor(socket: Socket, onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void) {
        this.socket = socket;
        this.onConnectionStateChange = onConnectionStateChange;
        this.setupSocketListeners();
    }

    private setupSocketListeners() {
        // 监听统一的信令消息
        this.socket.on('signal', async (data: { from: string; target: string; payload: SignalPayload }) => {
            const { from, payload } = data;
            // console.log(`Received signal (${payload.type}) from ${from}`);

            if (payload.type === 'offer' && payload.sdp) {
                await this.handleOffer(from, payload.sdp);
            } else if (payload.type === 'answer' && payload.sdp) {
                await this.handleAnswer(from, payload.sdp);
            } else if (payload.type === 'ice' && payload.candidate) {
                await this.handleCandidate(from, payload.candidate);
            }
        });
    }

    private createPeerConnection(targetId: string): RTCPeerConnection {
        // 如果已经存在连接，先关闭旧的（或者复用，这里简化为新建）
        if (this.peerConnections.has(targetId)) {
            console.warn(`PeerConnection for ${targetId} already exists. Closing old one.`);
            this.peerConnections.get(targetId)?.close();
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' } // 使用公共 STUN 服务器
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // console.log("Sending ICE candidate to", targetId);
                this.socket.emit('signal', {
                    target: targetId,
                    payload: {
                        type: 'ice',
                        candidate: event.candidate
                    }
                });
            }
        };

        pc.onconnectionstatechange = () => {
            // console.log(`Connection state with ${targetId}: ${pc.connectionState}`);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(targetId, pc.connectionState);
            }
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.cleanupPeer(targetId);
            }
        };

        // 监听 DataChannel (被动方)
        pc.ondatachannel = (event) => {
            // console.log(`Received DataChannel from ${targetId}`);
            const dc = event.channel;
            this.setupDataChannel(targetId, dc);
        };

        this.peerConnections.set(targetId, pc);
        return pc;
    }

    private setupDataChannel(targetId: string, dc: RTCDataChannel) {
        this.dataChannels.set(targetId, dc);

        dc.onopen = () => {
            // console.log(`DataChannel with ${targetId} is OPEN`);
            // 测试发送消息
            dc.send(`Hello from ${this.socket.id}`);
        };

        dc.onmessage = (e) => {
            // console.log(`Message from ${targetId}: ${e.data}`);
        };

        dc.onclose = () => {
            // console.log(`DataChannel with ${targetId} is CLOSED`);
        };
    }

    // 主动发起连接
    public async startCall(targetId: string) {
        // console.log("Starting call to", targetId);
        const pc = this.createPeerConnection(targetId);

        // 主动方创建 DataChannel
        const dc = pc.createDataChannel("chat");
        this.setupDataChannel(targetId, dc);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket.emit('signal', {
                target: targetId,
                payload: {
                    type: 'offer',
                    sdp: offer
                }
            });
        } catch (err) {
            console.error("Error creating offer:", err);
        }
    }

    private async handleOffer(sender: string, sdp: RTCSessionDescriptionInit) {
        const pc = this.createPeerConnection(sender);

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit('signal', {
                target: sender,
                payload: {
                    type: 'answer',
                    sdp: answer
                }
            });
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    }

    private async handleAnswer(sender: string, sdp: RTCSessionDescriptionInit) {
        const pc = this.peerConnections.get(sender);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            } catch (err) {
                console.error("Error handling answer:", err);
            }
        } else {
            console.warn("Received answer for unknown peer:", sender);
        }
    }

    private async handleCandidate(sender: string, candidate: RTCIceCandidateInit) {
        const pc = this.peerConnections.get(sender);
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error("Error adding ICE candidate:", err);
            }
        } else {
            console.warn("Received candidate for unknown peer:", sender);
        }
    }

    public disconnect(peerId: string) {
        this.cleanupPeer(peerId);
        if (this.onConnectionStateChange) {
            this.onConnectionStateChange(peerId, 'closed');
        }
    }

    private cleanupPeer(peerId: string) {
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }
        const dc = this.dataChannels.get(peerId);
        if (dc) {
            dc.close();
            this.dataChannels.delete(peerId);
        }
    }
}

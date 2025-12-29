import { Socket } from "socket.io-client";

export class WebRTCManager {
    socket: Socket;
    peerConnections: Map<string, RTCPeerConnection> = new Map();
    dataChannels: Map<string, RTCDataChannel> = new Map();

    constructor(socket: Socket) {
        this.socket = socket;
        this.setupSocketListeners();
    }

    private setupSocketListeners() {
        // 监听信令消息
        // 假设服务器转发的消息格式为 { sender: string, ...payload }
        this.socket.on('offer', async (data: { sender: string, sdp: RTCSessionDescriptionInit }) => {
            console.log("Received offer from", data.sender);
            await this.handleOffer(data);
        });

        this.socket.on('answer', async (data: { sender: string, sdp: RTCSessionDescriptionInit }) => {
            console.log("Received answer from", data.sender);
            await this.handleAnswer(data);
        });

        this.socket.on('ice-candidate', async (data: { sender: string, candidate: RTCIceCandidateInit }) => {
            console.log("Received ICE candidate from", data.sender);
            await this.handleCandidate(data);
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
                console.log("Sending ICE candidate to", targetId);
                this.socket.emit('ice-candidate', {
                    target: targetId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${targetId}: ${pc.connectionState}`);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.cleanupPeer(targetId);
            }
        };

        // 监听 DataChannel (被动方)
        pc.ondatachannel = (event) => {
            console.log(`Received DataChannel from ${targetId}`);
            const dc = event.channel;
            this.setupDataChannel(targetId, dc);
        };

        this.peerConnections.set(targetId, pc);
        return pc;
    }

    private setupDataChannel(targetId: string, dc: RTCDataChannel) {
        this.dataChannels.set(targetId, dc);

        dc.onopen = () => {
            console.log(`DataChannel with ${targetId} is OPEN`);
            // 测试发送消息
            dc.send(`Hello from ${this.socket.id}`);
        };

        dc.onmessage = (e) => {
            console.log(`Message from ${targetId}: ${e.data}`);
        };

        dc.onclose = () => {
            console.log(`DataChannel with ${targetId} is CLOSED`);
        };
    }

    // 主动发起连接
    public async startCall(targetId: string) {
        console.log("Starting call to", targetId);
        const pc = this.createPeerConnection(targetId);

        // 主动方创建 DataChannel
        const dc = pc.createDataChannel("chat");
        this.setupDataChannel(targetId, dc);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket.emit('offer', {
                target: targetId,
                sdp: offer
            });
        } catch (err) {
            console.error("Error creating offer:", err);
        }
    }

    private async handleOffer(data: { sender: string, sdp: RTCSessionDescriptionInit }) {
        const { sender, sdp } = data;
        const pc = this.createPeerConnection(sender);

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit('answer', {
                target: sender,
                sdp: answer
            });
        } catch (err) {
            console.error("Error handling offer:", err);
        }
    }

    private async handleAnswer(data: { sender: string, sdp: RTCSessionDescriptionInit }) {
        const { sender, sdp } = data;
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

    private async handleCandidate(data: { sender: string, candidate: RTCIceCandidateInit }) {
        const { sender, candidate } = data;
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

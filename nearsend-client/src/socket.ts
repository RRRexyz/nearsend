import { io, Socket } from "socket.io-client";
import { ref, computed } from "vue";

export interface Peer {
    id: string;
    name: string;
}

export class SocketManager {
    socket: Socket;
    socketID = ref<string>("");
    username = ref<string>("");
    peers = ref<Peer[]>([]);
    connectedPeers = ref<Set<string>>(new Set());

    constructor() {
        this.socket = io("http://localhost:3000");
        this.setupEventListeners();
    }

    public readonly displayedPrompt = computed(() => {
        if (this.connectedPeers.value.size > 0) {
            return "Your target peer: ";
        }
        return "Other connected peers: ";
    });

    public readonly displayedPeers = computed(() => {
        if (this.connectedPeers.value.size > 0) {
            return this.peers.value.filter(p => this.connectedPeers.value.has(p.id));
        }
        return this.peers.value;
    });

    private setupEventListeners() {
        this.socket.on('socket-id', (id: string) => {
            this.socketID.value = id;
        });

        this.socket.on('peer-list', (list: Peer[]) => {
            this.peers.value = list;
        });

        this.socket.on('peer-joined', (peer: Peer) => {
            this.peers.value.push(peer);
        });

        this.socket.on('peer-left', (id: string) => {
            this.peers.value = this.peers.value.filter(p => p.id !== id);
        });
    }

    join(username: string) {
        this.socket.emit("join", { name: username });
    }

    public generateRandomUsername() {
        this.username.value = 'Device ' + Math.random().toString(36).substring(5, 10);
        this.join(this.username.value);
    }

    getSocket(): Socket {
        return this.socket;
    }

    disconnect() {
        this.socket.disconnect();
    }
}

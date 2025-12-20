import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";

// —— 类型定义
interface Peer {
    id: string;
    name: string;
}

interface JoinData {
    name: string;
}

interface SignalPayload {
    type: "offer" | "answer" | "ice";
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

interface SignalData {
    target: string;
    payload: SignalPayload;
}

interface SignalToClientData extends SignalData {
    from: string;
}

// —— 服务器初始化
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 生产环境应设置为具体的前端地址
        methods: ["GET", "POST"],
    },
});

// 托管前端静态文件（如果有的话）
app.use(express.static("public"));

// 使用 Map 来存储在线用户，类型更安全
const peers = new Map<string, string>(); // key: socket.id, value: peer name

// —— Socket.IO 逻辑
io.on("connection", (socket: Socket) => {
    console.log(`[INFO] New client connected: ${socket.id}`);

    // 用户加入
    socket.on("join", (data: JoinData) => {
        peers.set(socket.id, data.name);
        console.log(`[INFO] ${data.name} (${socket.id}) joined.`);

        // 广播给其他用户：有新用户加入
        socket.broadcast.emit("peer-joined", { id: socket.id, name: data.name });
    
        // 向当前用户发送：在线用户列表
        const peerList: Peer[] = Array.from(peers.entries()).map(([id, name]) => ({ id, name }));
        socket.emit("peer-list", peerList);
    });

    // 转发信令消息
    socket.on("signal", (data: SignalData) => {
        console.log(`[INFO] Relaying signal from ${socket.id} to ${data.target}`);
        const outgoingData: SignalToClientData = {
            from: socket.id,
            ...data,
        };
        io.to(data.target).emit("signal", outgoingData);
    });

    // 用户断开连接
    socket.on("disconnect", () => {
        const name = peers.get(socket.id);
        if (name) {
            console.log(`[INFO] ${name} (${socket.id}) disconnected.`);
            peers.delete(socket.id);
            // 广播给其他用户：有用户离开
            socket.broadcast.emit("peer-left", socket.id);
        }
    });
});

// —— 启动服务器
const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`[INFO] Server is running on http://0.0.0.0:${PORT}`);
});
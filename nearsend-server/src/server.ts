import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";

// —— 1. 定义与 DOM 无关的 WebRTC 类型 (避免 Node环境 报错)
interface SimpleSessionDescription {
    type: "offer" | "answer" | "pranswer" | "rollback";
    sdp?: string;
}

interface SimpleIceCandidate {
    candidate?: string;
    sdpMid?: string;
    sdpMLineIndex?: number | null;
    usernameFragment?: string;
}

// —— 2. 定义 Socket.IO 事件接口 (强类型)
// 客户端发送给服务器的事件
interface ClientToServerEvents {
    "join": (data: { name: string }) => void;
    "signal": (data: { target: string; payload: SignalPayload }) => void;
}

// 服务器发送给客户端的事件
interface ServerToClientEvents {
    "peer-joined": (data: { id: string; name: string }) => void;
    "peer-left": (id: string) => void;
    "peer-list": (data: { id: string; name: string }[]) => void;
    "signal": (data: { from: string; target: string; payload: SignalPayload }) => void;
    "error-message": (data: { message: string }) => void;
}

interface InterServerEvents { }

interface SocketData {
    name: string; // 将用户名直接绑定在 socket 实例数据上
}

// —— 数据结构定义
interface SignalPayload {
    type: "offer" | "answer" | "ice";
    sdp?: SimpleSessionDescription;     // 使用自定义类型
    candidate?: SimpleIceCandidate;     // 使用自定义类型
}

// —— 服务器初始化
const app = express();
const server = http.createServer(app);

// 使用泛型初始化 Server，获得完整的类型推断
const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*", // 支持环境变量配置 CORS
        methods: ["GET", "POST"],
    },
});

app.use(express.static("public"));

// —— Socket.IO 逻辑
io.on("connection", (socket) => {
    console.log(`[INFO] New client connected: ${socket.id}`);

    // 用户加入
    socket.on("join", (data) => {
        // 简单的输入验证
        if (!data.name || typeof data.name !== "string") {
            return;
        }

        // 将状态直接存储在 socket.data 中 (Socket.IO 内置特性)，也可以继续用 Map
        socket.data.name = data.name;

        console.log(`[INFO] ${data.name} (${socket.id}) joined.`);

        // 广播给其他用户
        socket.broadcast.emit("peer-joined", { id: socket.id, name: data.name });

        // 获取在线列表 (利用 io.sockets.sockets)
        const peerList: { id: string; name: string }[] = [];
        io.sockets.sockets.forEach((s) => {
            if (s.id !== socket.id && s.data.name) {
                peerList.push({ id: s.id, name: s.data.name });
            }
        });

        socket.emit("peer-list", peerList);
    });

    // 转发信令
    socket.on("signal", (data) => {
        // 验证目标是否存在
        const targetSocket = io.sockets.sockets.get(data.target);

        if (targetSocket) {
            console.log(`[INFO] Relaying signal from ${socket.id} to ${data.target}`);
            io.to(data.target).emit("signal", {
                from: socket.id,
                target: data.target,
                payload: data.payload,
            });
        } else {
            console.warn(`[WARN] Signal target ${data.target} not found.`);
            // 可选：通知发送者目标不存在
            socket.emit("error-message", { message: `User ${data.target} not found or disconnected.` });
        }
    });

    // 断开连接
    socket.on("disconnect", () => {
        const name = socket.data.name;
        if (name) {
            console.log(`[INFO] ${name} (${socket.id}) disconnected.`);
            socket.broadcast.emit("peer-left", socket.id);
        }
    });
});

// —— 启动服务器
const PORT = process.env.PORT || 3000; // 优先使用环境变量
server.listen(PORT, () => {
    console.log(`[INFO] Server is running on http://0.0.0.0:${PORT}`);
});
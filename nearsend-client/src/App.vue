<script setup lang="ts">
import { io } from "socket.io-client";
import { computed, onMounted, ref, shallowRef } from "vue";
import { WebRTCManager } from "./webrtc";
import { FileSend } from "./filesend";
import { FileReceive } from "./receive";

interface Peer {
    id: string;
    name: string;
}

const socket = io("http://localhost:3000");
const username = ref<string>("");
const socketID = ref<string>("");
const peers = ref<Peer[]>([]);
const connectedPeers = ref<Set<string>>(new Set());
let webrtcManager: WebRTCManager;
const fileSend = shallowRef<FileSend | null>(null);
const fileReceive = shallowRef<FileReceive | null>(null);
const displayedPrompt = computed(() => {
    if (connectedPeers.value.size > 0) {
        return "Your target peer: ";
    }
    return "Other connected peers: ";
});

const displayedPeers = computed(() => {
    if (connectedPeers.value.size > 0) {
        return peers.value.filter(p => connectedPeers.value.has(p.id));
    }
    return peers.value;
});

socket.on('socket-id', (id: string) => {
    socketID.value = id;
});

socket.on('peer-list', (list: Peer[]) => {
    peers.value = list;
    // console.log("peers:", peers.value);
});

socket.on('peer-joined', (peer: Peer) => {
    peers.value.push(peer);
    // console.log("peers:", peers.value);
});

socket.on('peer-left', (id: string) => {
    peers.value = peers.value.filter(p => p.id !== id);
    // console.log("peers:", peers.value);
});

onMounted(() => {
    username.value = 'Device ' + Math.random().toString(36).substring(5, 10);
    socket.emit("join", { name: username.value });
    webrtcManager = new WebRTCManager(socket, (peerId, state) => {
        if (state === 'connected') {
            connectedPeers.value.add(peerId);
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            connectedPeers.value.delete(peerId);
            if (fileSend.value) {
                fileSend.value = null;
            }
            if (fileReceive.value) {
                fileReceive.value = null;
            }
        }
    }, channel => {
        fileSend.value = new FileSend(channel);
        fileReceive.value = new FileReceive(channel);
        channel.onmessage = (event) => {
            fileReceive.value?.handleMessage(event);
        };
    });
});

const toggleConnection = (peerId: string) => {
    if (connectedPeers.value.has(peerId)) {
        webrtcManager.disconnect(peerId);
    } else {
        webrtcManager.startCall(peerId);
    }
};

const selectedFile = shallowRef<File | null>(null);

const handleFileSelect = (event: Event) => {
    const target = event.target as HTMLInputElement;
    selectedFile.value = target.files?.item(0) ?? null;
    if (fileSend.value) {
        fileSend.value.hasSent.value = false;
    }
}

const sendFile = async () => {
    if (selectedFile.value && fileSend.value) {
        await fileSend.value.sendFile(selectedFile.value);
    }
}

const inputFileDisabled = computed(() => {
    return !fileSend.value || !fileSend.value.dataChannel.value || fileSend.value.isSending.value;
});

const sendFileDisabled = computed(() => {
    return inputFileDisabled.value || !selectedFile.value || fileSend.value?.hasSent.value;
});

const ifSending = computed(() => {
    return selectedFile.value && (fileSend.value?.isSending.value || fileSend.value?.hasSent.value);
});

const ifReceiving = computed(() => {
    return fileReceive.value?.isReceiving.value || fileReceive.value?.hasReceived.value;
});

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

const fileSendProgress = computed(() => {
    let unit = 'B';
    let current = fileSend.value?.sendingProgress.current ?? 0;
    let total = fileSend.value?.sendingProgress.total ?? 0;
    if (total < KB) {
        unit = 'B';
    } else if (total < MB) {
        unit = 'KB';
        current = current / KB;
        total = total / KB;
    } else if (total < GB) {
        unit = 'MB';
        current = current / MB;
        total = total / MB;
    } else {
        unit = 'GB';
        current = current / GB;
        total = total / GB;
    }
    return `${current.toFixed(3)} ${unit} / ${total.toFixed(3)} ${unit}`;
});

const fileReceiveProgress = computed(() => {
    let unit = 'B';
    let current = fileReceive.value?.receiveProgress.current ?? 0;
    let total = fileReceive.value?.receiveProgress.total ?? 0;
    if (total < KB) {
        unit = 'B';
    } else if (total < MB) {
        unit = 'KB';
        current = current / KB;
        total = total / KB;
    } else if (total < GB) {
        unit = 'MB';
        current = current / MB;
        total = total / MB;
    } else {
        unit = 'GB';
        current = current / GB;
        total = total / GB;
    }
    return `${current.toFixed(3)} ${unit} / ${total.toFixed(3)} ${unit}`;
});
</script>

<template>
    <p>Your username: {{ username }}</p>
    <p>Your socket ID: {{ socketID }}</p>
    <p>{{ displayedPrompt }}</p>
    <ul>
        <li v-for="peer in displayedPeers" :key="peer.id">
            {{ peer.name }} ({{ peer.id }})
            <button @click="toggleConnection(peer.id)">
                {{ connectedPeers.has(peer.id) ? 'Disconnect' : 'Connect' }}
            </button>
        </li>
    </ul>
    <div>
        <input type="file" @change="handleFileSelect" :disabled="inputFileDisabled" />
        <button @click="sendFile" :disabled="sendFileDisabled">发送</button>
    </div>
    <div v-if="ifSending">
        <p>正在发送：{{ fileSend?.filename }} {{ fileSendProgress }}</p>
        <progress :value="fileSend?.sendingProgress.percentage" max="100"></progress>
        <a>{{ fileSend?.sendingProgress.percentage }}%</a>
    </div>
    <div v-if="ifReceiving">
        <p>正在接收：{{ fileReceive?.filename }} {{ fileReceiveProgress }}</p>
        <progress :value="fileReceive?.receiveProgress.percentage" max="100"></progress>
        <a>{{ fileReceive?.receiveProgress.percentage }}%</a>
    </div>
</template>

<style scoped></style>

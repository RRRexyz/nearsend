<script setup lang="ts">
import { io } from "socket.io-client";
import { computed, onMounted, ref } from "vue";
import { WebRTCManager } from "./webrtc";

interface Peer {
    id: string;
    name: string;
}

const socket = io("http://localhost:3000");
const username = ref<string>("");
const socketID = ref<string>("");
const peers = ref<Peer[]>([]);
const connectedPeers = ref<Set<string>>(new Set());

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

let webrtcManager: WebRTCManager;

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
        }
    });
});

const toggleConnection = (peerId: string) => {
    if (connectedPeers.value.has(peerId)) {
        webrtcManager.disconnect(peerId);
    } else {
        webrtcManager.startCall(peerId);
    }
};
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
</template>

<style scoped></style>

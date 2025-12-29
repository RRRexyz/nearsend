<script setup lang="ts">
import { io } from "socket.io-client";
import { onMounted, ref } from "vue";
import { WebRTCManager } from "./webrtc";

interface Peer {
    id: string;
    name: string;
}

const socket = io("http://localhost:3000");
const username = ref<string>("");
const socketID = ref<string>("");
const peers = ref<Peer[]>([]);
let webrtcManager: WebRTCManager;

socket.on('socket-id', (id: string) => {
    socketID.value = id;
});

socket.on('peer-list', (list: Peer[]) => {
    peers.value = list;
    console.log("peers:", peers.value);
});

socket.on('peer-joined', (peer: Peer) => {
    peers.value.push(peer);
    console.log("peers:", peers.value);
});

socket.on('peer-left', (id: string) => {
    peers.value = peers.value.filter(p => p.id !== id);
    console.log("peers:", peers.value);
});

onMounted(() => {
    username.value = 'Device ' + Math.random().toString(36).substring(5, 10);
    socket.emit("join", { name: username.value });
    webrtcManager = new WebRTCManager(socket);
});

const connectToPeer = (peerId: string) => {
    webrtcManager.startCall(peerId);
};
</script>

<template>
    <p>Your username: {{ username }}</p>
    <p>Your socket ID: {{ socketID }}</p>
    <p>Other connected peers:</p>
    <ul>
        <li v-for="peer in peers" :key="peer.id">
            {{ peer.name }} ({{ peer.id }})
            <button @click="connectToPeer(peer.id)">Connect</button>
        </li>
    </ul>
</template>

<style scoped></style>

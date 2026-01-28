<script setup lang="ts">
import { onMounted, shallowRef } from "vue";
import { SocketManager } from "./socket";
import { WebRTCManager } from "./webrtc";
import { FileSend } from "./filesend";
import { FileReceive } from "./receive";

const socketManager = new SocketManager();
let webrtcManager: WebRTCManager;
const fileSend = shallowRef<FileSend | null>(null);
const fileReceive = shallowRef<FileReceive | null>(null);

onMounted(() => {
    socketManager.generateRandomUsername();
    webrtcManager = new WebRTCManager(socketManager.getSocket(), (peerId, state) => {
        if (state === 'connected') {
            socketManager.connectedPeers.value.add(peerId);
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            socketManager.connectedPeers.value.delete(peerId);
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
    if (socketManager.connectedPeers.value.has(peerId)) {
        webrtcManager.disconnect(peerId);
    } else {
        webrtcManager.startCall(peerId);
    }
};
</script>

<template>
    <p>Your username: {{ socketManager.username.value }}</p>
    <p>Your socket ID: {{ socketManager.socketID.value }}</p>
    <p>{{ socketManager.displayedPrompt }}</p>
    <ul>
        <li v-for="peer in socketManager.displayedPeers.value" :key="peer.id">
            {{ peer.name }} ({{ peer.id }})
            <button @click="toggleConnection(peer.id)">
                {{ socketManager.connectedPeers.value.has(peer.id) ? 'Disconnect' : 'Connect' }}
            </button>
        </li>
    </ul>
    <div>
        <input type="file" @change="fileSend?.handleFileSelect($event)" :disabled="!fileSend || fileSend.inputFileDisabled.value" />
        <button @click="fileSend?.sendCurrentFile()" :disabled="!fileSend || fileSend.sendFileDisabled.value">发送</button>
    </div>
    <div v-if="fileSend?.ifSending.value">
        <p>正在发送：{{ fileSend?.filename?.value }} {{ fileSend?.formattedProgress?.value }}</p>
        <progress :value="fileSend?.sendingProgress.percentage" max="100"></progress>
        <a>{{ fileSend?.sendingProgress.percentage }}%</a>
    </div>
    <div v-if="fileReceive?.ifReceiving.value">
        <p>正在接收：{{ fileReceive?.filename?.value }} {{ fileReceive?.formattedProgress?.value }}</p>
        <progress :value="fileReceive?.receiveProgress.percentage" max="100"></progress>
        <a>{{ fileReceive?.receiveProgress.percentage }}%</a>
    </div>
</template>

<style scoped></style>

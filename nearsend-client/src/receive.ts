import { ref, reactive } from 'vue';
import { type FileMetadata, type SendProgress } from "./filesend";

export class FileReceive {
    dataChannel = ref<RTCDataChannel | null>(null);
    receiveProgress: SendProgress = reactive({ current: 0, total: 0, percentage: 0 });
    isReceiving = ref<boolean>(false);
    hasReceived = ref<boolean>(false);
    filename = ref<string>('');
    buffer = reactive<ArrayBuffer[]>([]);

    constructor(dataChannel: RTCDataChannel) {
        this.dataChannel.value = dataChannel;
    }


    /// 核心消息处理函数根据数据类型判断是元数据(字符串)还是文件块(ArrayBuffer)
    public handleMessage(event: MessageEvent) {
        const data = event.data;

        // 1. 处理元数据
        if (typeof data === 'string') {
            try {
                const metadata = JSON.parse(data) as FileMetadata;

                // 初始化接收状态
                this.isReceiving.value = true;
                this.filename.value = metadata.name;
                this.receiveProgress.total = metadata.size;
                this.receiveProgress.current = 0;
                this.receiveProgress.percentage = 0;
                this.buffer = []; // 清空之前的缓冲区

                console.log(`[Receiver] 开始接收文件: ${metadata.name} (${metadata.size} bytes)`);
            } catch (e) {
                console.error('[Receiver] 解析元数据失败', e);
            }
            return;
        }

        // 2. 处理文件块
        if (data instanceof ArrayBuffer) {
            if (!this.isReceiving.value) {
                console.warn('[Receiver] 收到文件块，但未处于接收状态，将忽略该块');
                return;
            }

            this.buffer.push(data);
            this.receiveProgress.current += data.byteLength;
            this.receiveProgress.percentage = Math.floor((this.receiveProgress.current / this.receiveProgress.total) * 100);

        }

        // 3. 检查是否接收完毕
        if (this.receiveProgress.current >= this.receiveProgress.total) {
            console.log('[Receiver] 文件接收完毕，开始组装...');
            this.assembleAndDownloadFile();
        }
    }

    /// 组装数据块并触发下载
    assembleAndDownloadFile() {
        // 1. 使用 Blob 构造函数合并所有 ArrayBuffer
        const blob = new Blob(this.buffer);

        // 2. 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = this.filename.value;

        // 3. 触发点击
        document.body.appendChild(a);
        a.click();

        // 4. 清理工作 (非常重要，防止内存泄漏)
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // 释放内存

            // 重置状态
            this.isReceiving.value = false;
            this.buffer = [];
            this.hasReceived.value = true;
        }, 100);
    }
}
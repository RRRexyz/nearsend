import { ref, reactive } from 'vue';

// 文件元数据接口
export interface FileMetadata {
    type: 'metadata';
    name: string;
    size: number;
    fileType: string;
}

// 发送进度接口
export interface SendProgress {
    current: number;
    total: number;
    percentage: number;
}

export class FileSend {
    dataChannel = ref<RTCDataChannel | null>(null);
    sendingProgress: SendProgress = reactive({ current: 0, total: 0, percentage: 0 });
    isSending = ref<boolean>(false);
    hasSent = ref<boolean>(false);
    filename = ref<string>('');
    static readonly CHUNK_SIZE = 16 * 1024; // 16KB 每片
    static readonly BUFFER_THRESHOLD = 256 * 1024; // 256KB 缓冲区阈值

    constructor(dataChannel: RTCDataChannel) {
        this.dataChannel.value = dataChannel;
    }

    /// 等待缓冲区排空，这是一个辅助函数，防止发送过快导致内存溢出 
    private waitForBufferDrain(channel: RTCDataChannel): Promise<void> {
        return new Promise((resolve) => {
            // 如果当前缓冲区小于阈值，直接继续
            if (channel.bufferedAmount < FileSend.BUFFER_THRESHOLD) {
                resolve();
                return;
            }
            // 否则，监听缓冲区低水位事件
            channel.onbufferedamountlow = () => {
                channel.onbufferedamountlow = null; // 移除监听器
                resolve();
            }
        });
    }

    /// 处理文件选择
    public async handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file || !this.dataChannel) return;
        try {
            await this.sendFile(file);
        } catch (error) {
            console.error("Error sending file:", error);
        } finally {
            target.value = ""; // 重置文件输入
        }
    }

    /// 发送文件
    public async sendFile(file: File) {
        if (!this.dataChannel) throw new Error("Data channel is not established.");
        this.isSending.value = true;
        this.filename.value = file.name;

        // 1. 发送文件元数据(转为JSON字符串)
        const metadata: FileMetadata = {
            type: 'metadata',
            name: file.name,
            size: file.size,
            fileType: file.type
        };
        this.dataChannel.value?.send(JSON.stringify(metadata));

        // 2. 初始化进度
        this.sendingProgress.total = file.size;

        // 3. 分片循环发送
        let offset = 0;
        // 必须设置 bufferedAmountLowThreshold，以便 onbufferedamountlow 事件触发
        this.dataChannel.value!.bufferedAmountLowThreshold = FileSend.BUFFER_THRESHOLD / 2;
        while (offset < file.size) {
            const slice: Blob = file.slice(offset, offset + FileSend.CHUNK_SIZE);
            const buffer: ArrayBuffer = await slice.arrayBuffer();
            // 检查并等待缓冲区有足够空间
            await this.waitForBufferDrain(this.dataChannel.value!);
            // 发送二进制数据
            this.dataChannel.value!.send(buffer);
            // 更新进度
            offset += buffer.byteLength;
            this.sendingProgress.current = offset;
            this.sendingProgress.percentage = Math.floor((offset / file.size) * 100);
            // console.log(`Sent ${this.sendingProgress.percentage}%`);
        }
        this.isSending.value = false;
        this.hasSent.value = true;
        console.log("File send complete.");
    }
}
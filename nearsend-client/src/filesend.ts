import { ref, reactive, computed } from 'vue';
import { type FileMetadata, type TransmitProgress } from "./common";

export class FileSend {
    dataChannel = ref<RTCDataChannel | null>(null);
    sendingProgress: TransmitProgress = reactive({ current: 0, total: 0, percentage: 0 });
    isSending = ref<boolean>(false);
    hasSent = ref<boolean>(false);
    filename = ref<string>('');
    selectedFile = ref<File | null>(null);

    static readonly CHUNK_SIZE = 16 * 1024; // 16KB 每片
    static readonly BUFFER_THRESHOLD = 256 * 1024; // 256KB 缓冲区阈值

    constructor(dataChannel: RTCDataChannel) {
        this.dataChannel.value = dataChannel;
    }

    public readonly formattedProgress = computed(() => {
        const KB = 1024;
        const MB = 1024 * 1024;
        const GB = 1024 * 1024 * 1024;
        let unit = 'B';
        let current = this.sendingProgress.current ?? 0;
        let total = this.sendingProgress.total ?? 0;
        
        if (total === 0) return `0.000 B / 0.000 B`;

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

    public readonly inputFileDisabled = computed(() => {
        return !this.dataChannel.value || this.isSending.value;
    });

    public readonly sendFileDisabled = computed(() => {
        return this.inputFileDisabled.value || !this.selectedFile.value || this.hasSent.value;
    });
    
    public readonly ifSending = computed(() => {
      // 只有在选择了文件的情况下，才显示发送进度或结果
      return this.selectedFile.value && (this.isSending.value || this.hasSent.value);
    });

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
    public handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        this.selectedFile.value = target.files?.item(0) ?? null;
        this.hasSent.value = false;
    }

    public async sendCurrentFile() {
        if (this.selectedFile.value) {
            await this.sendFile(this.selectedFile.value);
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
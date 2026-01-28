// 文件元数据接口
export interface FileMetadata {
    type: 'metadata';
    name: string;
    size: number;
    fileType: string;
}

// 传输进度接口
export interface TransmitProgress {
    current: number; // 当前已发送字节数 (B)
    total: number; // 文件总字节数 (B)
    percentage: number; // 发送百分比 (0-100)
}
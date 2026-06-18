const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { Readable } = require('stream');

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond >= 1024 * 1024) {
    return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s';
  } else if (bytesPerSecond >= 1024) {
    return (bytesPerSecond / 1024).toFixed(2) + ' KB/s';
  } else {
    return bytesPerSecond.toFixed(2) + ' B/s';
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  } else if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  } else if (bytes >= 1024) {
    return (bytes / 1024).toFixed(2) + ' KB';
  } else {
    return bytes + ' B';
  }
}

app.post('/upload', (req, res) => {
  const startTime = Date.now();
  const totalSize = parseInt(req.headers['content-length'], 10);

  if (totalSize && totalSize > MAX_FILE_SIZE) {
    return res.status(413).json({
      success: false,
      message: `文件过大，最大允许 ${formatSize(MAX_FILE_SIZE)}`
    });
  }

  let memLogInterval = setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[内存监控] RSS: ${formatSize(mem.rss)} | Heap: ${formatSize(mem.heapUsed)}/${formatSize(mem.heapTotal)}`);
  }, 2000);

  upload.single('file')(req, res, (err) => {
    clearInterval(memLogInterval);
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const durationSec = durationMs / 1000;

    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: `文件超过大小限制 ${formatSize(MAX_FILE_SIZE)}`
        });
      }
      return res.status(500).json({
        success: false,
        message: '上传失败: ' + err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '未接收到文件'
      });
    }

    const fileSize = req.file.size;
    const avgSpeed = durationSec > 0 ? fileSize / durationSec : 0;

    const mem = process.memoryUsage();
    const result = {
      success: true,
      filename: req.file.originalname,
      storedName: req.file.filename,
      fileSize: fileSize,
      fileSizeFormatted: formatSize(fileSize),
      totalSize: totalSize || fileSize,
      durationMs: durationMs,
      durationSec: durationSec.toFixed(3),
      avgSpeed: avgSpeed,
      avgSpeedFormatted: formatSpeed(avgSpeed),
      mimeType: req.file.mimetype,
      timestamp: new Date().toISOString(),
      memoryUsage: {
        rss: formatSize(mem.rss),
        heapUsed: formatSize(mem.heapUsed)
      }
    };

    console.log(`[上传完成] ${result.filename} | ${result.fileSizeFormatted} | ${result.avgSpeedFormatted} | ${result.durationSec}s | 内存: ${result.memoryUsage.rss}`);

    res.json(result);
  });
});

const DOWNLOAD_SIZES = {
  '1mb': 1 * 1024 * 1024,
  '10mb': 10 * 1024 * 1024,
  '50mb': 50 * 1024 * 1024,
  '100mb': 100 * 1024 * 1024,
  '200mb': 200 * 1024 * 1024,
  '500mb': 500 * 1024 * 1024,
  '1gb': 1024 * 1024 * 1024
};

app.get('/download', (req, res) => {
  const sizeKey = (req.query.size || '10mb').toLowerCase();
  const totalBytes = DOWNLOAD_SIZES[sizeKey];

  if (!totalBytes) {
    return res.status(400).json({
      success: false,
      message: `无效的大小参数，支持: ${Object.keys(DOWNLOAD_SIZES).join(', ')}`
    });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', totalBytes);
  res.setHeader('Content-Disposition', `attachment; filename="test_${sizeKey}.bin"`);
  res.setHeader('X-Download-Size', totalBytes);
  res.setHeader('Cache-Control', 'no-store, no-cache');

  const CHUNK_SIZE = 64 * 1024;
  const chunk = Buffer.alloc(CHUNK_SIZE);
  let bytesSent = 0;
  const startTime = Date.now();

  const stream = new Readable({
    read() {
      if (bytesSent >= totalBytes) {
        const durationSec = (Date.now() - startTime) / 1000;
        const avgSpeed = durationSec > 0 ? totalBytes / durationSec : 0;
        console.log(`[下载完成] ${sizeKey} | ${formatSize(totalBytes)} | ${formatSpeed(avgSpeed)} | ${durationSec.toFixed(3)}s | 内存: ${formatSize(process.memoryUsage().rss)}`);
        this.push(null);
        return;
      }

      const remaining = totalBytes - bytesSent;
      const toSend = Math.min(CHUNK_SIZE, remaining);
      bytesSent += toSend;
      this.push(toSend === CHUNK_SIZE ? chunk : chunk.subarray(0, toSend));
    }
  });

  stream.pipe(res);
});

app.get('/download/sizes', (req, res) => {
  const sizes = Object.entries(DOWNLOAD_SIZES).map(([key, bytes]) => ({
    key,
    bytes,
    label: formatSize(bytes)
  }));
  res.json({ success: true, sizes });
});

app.get('/uploads', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    const fileList = files.map((file) => {
      const filePath = path.join(uploadDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        sizeFormatted: formatSize(stats.size),
        modified: stats.mtime
      };
    });
    res.json({ success: true, files: fileList });
  });
});

app.delete('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: '文件不存在' });
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: '文件已删除' });
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  网络速率测试服务已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  上传接口: POST http://localhost:${PORT}/upload`);
  console.log(`  下载接口: GET  http://localhost:${PORT}/download?size=10mb`);
  console.log(`  最大文件: ${formatSize(MAX_FILE_SIZE)}`);
  console.log(`  存储模式: 流式写入磁盘 (multer diskStorage)`);
  console.log(`========================================\n`);
});

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage });

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
  let bytesReceived = 0;
  const totalSize = parseInt(req.headers['content-length'], 10);

  req.on('data', (chunk) => {
    bytesReceived += chunk.length;
  });

  upload.single('file')(req, res, (err) => {
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const durationSec = durationMs / 1000;

    if (err) {
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
      timestamp: new Date().toISOString()
    };

    console.log(`[上传完成] ${result.filename} | ${result.fileSizeFormatted} | ${result.avgSpeedFormatted} | ${result.durationSec}s`);

    res.json(result);
  });
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
  console.log(`  文件上传速度测试服务已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  上传接口: POST http://localhost:${PORT}/upload`);
  console.log(`========================================\n`);
});

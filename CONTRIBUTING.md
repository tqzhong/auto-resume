# 参与贡献

欢迎提交问题和 Pull Request。请使用虚构的姓名、公司、联系方式和照片重现问题，不要把真实简历附到公开 Issue。

```bash
npm ci
npm run format:check
npm test
npm run build
npm start
```

打开 `http://127.0.0.1:8765`。源码目录和验证边界见 [README](README.md) 与 [AGENTS.md](AGENTS.md)。

涉及排版、字体或 PDF 的改动，请附修改前后的示例截图，并说明浏览器、操作系统、页数和导出方式。涉及备份格式的改动，应保留已有 `.resume.json` 的兼容性，并补充有意义的往返测试。

修改后可用 `npm run format` 统一格式。提交前检查暂存区中没有真实简历、照片、密钥或私有部署信息。构建产物 `dist/` 不提交。

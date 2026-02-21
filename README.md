# AudioInsight AI

AudioInsight AI is a tool designed to transcribe, summarize, and extract actionable insights from audio files. Whether you're processing meeting recordings, interviews, or lectures, AudioInsight AI helps you turn raw audio into organized, useful data.

## 🚀 Features

- **User-Provided API Key**: Securely use your own Gemini API key, stored locally in your browser.
- **PWA Support**: Install AudioInsight AI as a local app on your desktop or mobile device for a native-like experience.
- **Multimodal Analysis**: Powered by Gemini 3 Flash for high-accuracy transcription and intelligent summarization.
- **Dual Upload Options**:
  - **Local Upload**: Drag and drop or select files directly from your computer.
  - **Google Drive Integration**: Connect your Google Drive to browse and analyze files stored in the cloud.
- **Actionable Insights**: Automatically extracts next steps and tasks from your audio content.
- **Versatile Exporting**: Download your results in multiple formats (TXT, CSV, PDF).

## 🛠️ Tech Stack

- **Frontend**: React 19, Tailwind CSS, Lucide Icons, Motion.
- **PWA**: `vite-plugin-pwa` for offline capabilities and installation.
- **AI**: Google Gemini API (`gemini-3-flash-preview`).
- **Storage/Cloud**: Google Drive API (Client-side).

## ☁️ Cloud Connect Instructions (Google Drive)

AudioInsight AI is designed to be fully portable. You can provide your own API keys and Client IDs directly within the application settings.

### 1. Google Cloud Console Setup (for Drive)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and enable the **Google Drive API**.
3. Configure the **OAuth consent screen** (External).
4. Create **OAuth client ID** (Web application):
   - Add `http://localhost:3000` (dev) and your production origin to **Authorized JavaScript origins**.
   - Add the same origins to **Authorized redirect URIs**.
5. Copy your **Client ID**.

### 2. Application Setup
1. Launch the application.
2. Enter your **Gemini API Key** (required for analysis).
3. Enter your **Google Client ID** (optional, required only for Drive integration).
4. These keys are saved securely in your browser's local storage.

## 📦 Desktop Packaging (Electron)

AudioInsight AI can be packaged as a standalone desktop application for Windows, macOS, or Linux. This allows you to run the app locally without any third-party hosting dependencies.

### 1. Local Development
To run the app in desktop mode for development:
```bash
npm run electron:dev
```

### 2. Build the Desktop App
To package the application into an executable (e.g., `.exe`, `.dmg`, or `.AppImage`):
```bash
npm run electron:build
```
The packaged application will be available in the `release/` directory.

### 3. Google Drive Configuration for Desktop
When running as a desktop app, ensure your Google Cloud Console project is configured correctly:
- Add `http://localhost:3000` (for development) or `file://` (for production, though `http://localhost` is preferred for OAuth) to your **Authorized JavaScript origins**.
- For production desktop apps, it is recommended to use a custom protocol or a local loopback server for OAuth redirects.

## 📄 License

Apache-2.0

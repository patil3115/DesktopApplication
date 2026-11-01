const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const distPkg = path.join(rootDir, 'dist-package', 'SecureVideoCompressor-win32-x64');
const releaseDir = path.join(rootDir, 'release');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

console.log('====================================================');
console.log('    BUILDING SECURE VIDEO COMPRESSOR INSTALLER      ');
console.log('====================================================\n');

// 1. Verify dist-package exists
const mainExe = path.join(distPkg, 'SecureVideoCompressor.exe');
const ffmpegExe = path.join(distPkg, 'resources', 'bin', 'win32-x64', 'ffmpeg.exe');
const ffprobeExe = path.join(distPkg, 'resources', 'bin', 'win32-x64', 'ffprobe.exe');

if (!fs.existsSync(mainExe) || !fs.existsSync(ffmpegExe) || !fs.existsSync(ffprobeExe)) {
  console.log('dist-package missing or incomplete. Running packaging first...');
  execFileSync(process.execPath, [path.join(__dirname, 'package-portable.js')], {
    cwd: rootDir,
    stdio: 'inherit'
  });
}

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

// 2. Build uninstall.exe inside dist-package
console.log('[1/4] Compiling native Windows uninstaller...');
const uninstallCsPath = path.join(__dirname, 'Uninstall.cs');
const uninstallCs = `
using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Win32;

namespace SecureVideoCompressor.Uninstaller
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool silent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase)) silent = true;
            }

            if (!silent)
            {
                DialogResult dr = MessageBox.Show(
                    "Are you sure you want to completely uninstall Secure Video Compressor?",
                    "Uninstall Secure Video Compressor",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (dr != DialogResult.Yes) return;
            }

            try
            {
                Process[] procs = Process.GetProcessesByName("SecureVideoCompressor");
                foreach (Process p in procs)
                {
                    try { p.Kill(); p.WaitForExit(3000); } catch { }
                }

                string desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Secure Video Compressor.lnk");
                if (File.Exists(desktop)) File.Delete(desktop);

                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Secure Video Compressor.lnk");
                if (File.Exists(startMenu)) File.Delete(startMenu);

                try
                {
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SecureVideoCompressor", false);
                }
                catch { }

                string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\\\', '/');
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = string.Format("/c timeout /t 1 /nobreak > NUL & rmdir /s /q \\"{0}\\"", appDir),
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi);

                if (!silent)
                {
                    MessageBox.Show(
                        "Secure Video Compressor was successfully removed from your computer.",
                        "Uninstall Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            catch (Exception ex)
            {
                if (!silent)
                {
                    MessageBox.Show("An error occurred during uninstallation: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }
    }
}
`;

fs.writeFileSync(uninstallCsPath, uninstallCs.trim());
const uninstallOut = path.join(distPkg, 'uninstall.exe');
const iconPath = path.join(rootDir, 'resources', 'icon.ico');

execFileSync(cscPath, [
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  `/win32icon:${iconPath}`,
  `/out:${uninstallOut}`,
  uninstallCsPath
], { stdio: 'inherit' });
fs.unlinkSync(uninstallCsPath);

// 3. Compress dist-package into release/payload.zip
console.log('[2/4] Compressing application distribution payload...');
const payloadZip = path.join(releaseDir, 'payload.zip');
if (fs.existsSync(payloadZip)) {
  fs.unlinkSync(payloadZip);
}

// Compress using PowerShell ZipFile (optimized deflate)
execFileSync('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory("${distPkg}", "${payloadZip}", [System.IO.Compression.CompressionLevel]::Optimal, $false)`
], { stdio: 'inherit' });

const payloadStat = fs.statSync(payloadZip);
console.log(`Payload compressed: ${(payloadStat.size / (1024 * 1024)).toFixed(2)} MB`);

// Also create portable zip
const portableZip = path.join(releaseDir, 'SecureVideoCompressor-1.0.0-win32-x64-portable.zip');
fs.copyFileSync(payloadZip, portableZip);
console.log(`Portable release archive created: ${portableZip}`);

// 4. Generate C# Setup GUI
console.log('[3/4] Compiling native Windows GUI installer...');
const installerCsPath = path.join(__dirname, 'Installer.cs');
const installerCs = `
using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Threading;

namespace SecureVideoCompressor.Setup
{
    public class InstallerForm : Form
    {
        private ProgressBar progressBar;
        private Label lblTitle;
        private Label lblSubtitle;
        private Label lblStatus;
        private CheckBox chkLaunch;
        private Button btnAction;
        public string TargetDir { get; private set; }
        private bool isFinished = false;

        public InstallerForm()
        {
            this.Text = "Secure Video Compressor Setup";
            this.Width = 520;
            this.Height = 360;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(11, 14, 20);
            this.ForeColor = Color.White;

            TargetDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "SecureVideoCompressor"
            );

            lblTitle = new Label();
            lblTitle.Text = "Secure Video Compressor";
            lblTitle.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(16, 185, 129);
            lblTitle.Location = new Point(30, 25);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            lblSubtitle = new Label();
            lblSubtitle.Text = "Offline-First Desktop Video & Audio Processing (Windows x64)";
            lblSubtitle.Font = new Font("Segoe UI", 9, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(156, 163, 175);
            lblSubtitle.Location = new Point(32, 60);
            lblSubtitle.AutoSize = true;
            this.Controls.Add(lblSubtitle);

            Label lblInfo = new Label();
            lblInfo.Text = "Destination: " + TargetDir;
            lblInfo.Font = new Font("Segoe UI", 8, FontStyle.Regular);
            lblInfo.ForeColor = Color.FromArgb(107, 114, 128);
            lblInfo.Location = new Point(32, 110);
            lblInfo.Width = 440;
            lblInfo.AutoEllipsis = true;
            this.Controls.Add(lblInfo);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(32, 145);
            progressBar.Width = 440;
            progressBar.Height = 24;
            progressBar.Style = ProgressBarStyle.Continuous;
            this.Controls.Add(progressBar);

            lblStatus = new Label();
            lblStatus.Text = "Click Install to begin.";
            lblStatus.Font = new Font("Segoe UI", 9, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(209, 213, 219);
            lblStatus.Location = new Point(32, 185);
            lblStatus.Width = 440;
            lblStatus.AutoEllipsis = true;
            this.Controls.Add(lblStatus);

            chkLaunch = new CheckBox();
            chkLaunch.Text = "Launch Secure Video Compressor when finished";
            chkLaunch.Checked = true;
            chkLaunch.ForeColor = Color.FromArgb(229, 231, 235);
            chkLaunch.Font = new Font("Segoe UI", 9, FontStyle.Regular);
            chkLaunch.Location = new Point(32, 230);
            chkLaunch.AutoSize = true;
            chkLaunch.Visible = false;
            this.Controls.Add(chkLaunch);

            btnAction = new Button();
            btnAction.Text = "Install";
            btnAction.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btnAction.ForeColor = Color.White;
            btnAction.BackColor = Color.FromArgb(5, 150, 105);
            btnAction.FlatStyle = FlatStyle.Flat;
            btnAction.FlatAppearance.BorderSize = 0;
            btnAction.Location = new Point(352, 265);
            btnAction.Width = 120;
            btnAction.Height = 36;
            btnAction.Click += new EventHandler(BtnAction_Click);
            this.Controls.Add(btnAction);
        }

        private void BtnAction_Click(object sender, EventArgs e)
        {
            if (isFinished)
            {
                if (chkLaunch.Checked)
                {
                    string exePath = Path.Combine(TargetDir, "SecureVideoCompressor.exe");
                    if (File.Exists(exePath))
                    {
                        Process.Start(exePath);
                    }
                }
                this.Close();
                return;
            }

            btnAction.Enabled = false;
            Thread worker = new Thread(PerformInstall);
            worker.IsBackground = true;
            worker.Start();
        }

        private void PerformInstall()
        {
            try
            {
                UpdateStatus("Closing running instances...", 5);
                Process[] procs = Process.GetProcessesByName("SecureVideoCompressor");
                foreach (Process p in procs)
                {
                    try { p.Kill(); p.WaitForExit(3000); } catch { }
                }

                UpdateStatus("Preparing destination directory...", 10);
                if (!Directory.Exists(TargetDir))
                {
                    Directory.CreateDirectory(TargetDir);
                }

                UpdateStatus("Extracting application resources...", 20);
                using (Stream stream = typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))
                {
                    if (stream == null) throw new Exception("Embedded application payload was not found.");
                    using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        int total = archive.Entries.Count;
                        int current = 0;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            current++;
                            string destPath = Path.Combine(TargetDir, entry.FullName);
                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destPath);
                            }
                            else
                            {
                                string parentDir = Path.GetDirectoryName(destPath);
                                if (!Directory.Exists(parentDir)) Directory.CreateDirectory(parentDir);
                                entry.ExtractToFile(destPath, true);
                            }

                            int pct = 20 + (int)(((double)current / total) * 60);
                            if (pct > 80) pct = 80;
                            if (current % 10 == 0 || current == total)
                            {
                                UpdateStatus("Installing: " + entry.Name, pct);
                            }
                        }
                    }
                }

                UpdateStatus("Creating desktop and start menu shortcuts...", 85);
                CreateShortcuts();

                UpdateStatus("Registering in Windows Add/Remove Programs...", 95);
                RegisterUninstall();

                this.Invoke((MethodInvoker)delegate
                {
                    progressBar.Value = 100;
                    lblStatus.Text = "Installation complete! Secure Video Compressor is ready to use.";
                    lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                    chkLaunch.Visible = true;
                    btnAction.Text = "Finish";
                    btnAction.BackColor = Color.FromArgb(16, 185, 129);
                    btnAction.Enabled = true;
                    isFinished = true;
                });
            }
            catch (Exception ex)
            {
                this.Invoke((MethodInvoker)delegate
                {
                    lblStatus.Text = "Installation failed: " + ex.Message;
                    lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                    btnAction.Text = "Close";
                    btnAction.Enabled = true;
                    isFinished = true;
                });
            }
        }

        public void PerformInstallDirect()
        {
            try
            {
                Process[] procs = Process.GetProcessesByName("SecureVideoCompressor");
                foreach (Process p in procs)
                {
                    try { p.Kill(); p.WaitForExit(3000); } catch { }
                }

                if (!Directory.Exists(TargetDir)) Directory.CreateDirectory(TargetDir);

                using (Stream stream = typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))
                {
                    if (stream == null) return;
                    using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destPath = Path.Combine(TargetDir, entry.FullName);
                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destPath);
                            }
                            else
                            {
                                string parentDir = Path.GetDirectoryName(destPath);
                                if (!Directory.Exists(parentDir)) Directory.CreateDirectory(parentDir);
                                entry.ExtractToFile(destPath, true);
                            }
                        }
                    }
                }

                CreateShortcuts();
                RegisterUninstall();
            }
            catch { }
        }

        private void CreateShortcuts()
        {
            string exePath = Path.Combine(TargetDir, "SecureVideoCompressor.exe");
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType);
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                dynamic desktopLnk = shell.CreateShortcut(Path.Combine(desktop, "Secure Video Compressor.lnk"));
                desktopLnk.TargetPath = exePath;
                desktopLnk.WorkingDirectory = TargetDir;
                desktopLnk.Description = "Secure Video Compressor";
                desktopLnk.IconLocation = exePath + ",0";
                desktopLnk.Save();

                string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                dynamic startLnk = shell.CreateShortcut(Path.Combine(programs, "Secure Video Compressor.lnk"));
                startLnk.TargetPath = exePath;
                startLnk.WorkingDirectory = TargetDir;
                startLnk.Description = "Secure Video Compressor";
                startLnk.IconLocation = exePath + ",0";
                startLnk.Save();
            }
        }

        private void RegisterUninstall()
        {
            try
            {
                string exePath = Path.Combine(TargetDir, "SecureVideoCompressor.exe");
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SecureVideoCompressor"))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "Secure Video Compressor");
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "Security & Privacy Engineering Team");
                        key.SetValue("DisplayIcon", exePath + ",0");
                        key.SetValue("InstallLocation", TargetDir);
                        key.SetValue("UninstallString", Path.Combine(TargetDir, "uninstall.exe"));
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            }
            catch { }
        }

        private void UpdateStatus(string message, int progress)
        {
            if (this.InvokeRequired)
            {
                this.Invoke((MethodInvoker)delegate { UpdateStatus(message, progress); });
                return;
            }
            lblStatus.Text = message;
            if (progress >= 0 && progress <= 100) progressBar.Value = progress;
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool silent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) || arg.Equals("/silent", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
            }

            if (silent)
            {
                InstallerForm inst = new InstallerForm();
                inst.PerformInstallDirect();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }
}
`;

fs.writeFileSync(installerCsPath, installerCs.trim());
const setupOut = path.join(releaseDir, 'SecureVideoCompressor-Setup-1.0.0.exe');

execFileSync(cscPath, [
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  `/resource:${payloadZip},payload.zip`,
  `/win32icon:${iconPath}`,
  `/r:System.IO.Compression.dll`,
  `/r:System.IO.Compression.FileSystem.dll`,
  `/r:System.Windows.Forms.dll`,
  `/r:System.Drawing.dll`,
  `/r:Microsoft.CSharp.dll`,
  `/out:${setupOut}`,
  installerCsPath
], { stdio: 'inherit' });

fs.unlinkSync(installerCsPath);
fs.unlinkSync(payloadZip);

// 5. Output Details & Hash
const setupStat = fs.statSync(setupOut);
const hashSum = crypto.createHash('sha256');
hashSum.update(fs.readFileSync(setupOut));
const sha256 = hashSum.digest('hex');

console.log('\n[4/4] Package Build Complete!');
console.log('====================================================');
console.log(`Installer:  ${setupOut}`);
console.log(`Size:       ${(setupStat.size / (1024 * 1024)).toFixed(2)} MB (${setupStat.size} bytes)`);
console.log(`SHA-256:    ${sha256}`);
console.log(`Portable:   ${portableZip}`);
console.log('====================================================\n');

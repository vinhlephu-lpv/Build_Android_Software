Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Chọn thư mục dự án React Native"
$dialog.ShowNewFolderButton = $true

if (Test-Path "D:\reactnative\codereact") {
    $dialog.SelectedPath = "D:\reactnative\codereact"
} elseif (Test-Path "D:\My_Software") {
    $dialog.SelectedPath = "D:\My_Software"
}

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.Width = 0
$form.Height = 0
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.ShowInTaskbar = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Show()
$form.BringToFront()
$form.Activate()

$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
$form.Close()
$form.Dispose()
$dialog.Dispose()

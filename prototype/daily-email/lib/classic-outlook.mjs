/**
 * Generate a readable UTF-8 PowerShell helper for installed Classic Outlook on Windows.
 * It creates a native unsent Outlook draft and saves a Unicode .msg beside this script.
 * Only user-triggered download; no network access, no credentials, no Send method.
 */
import { buildSubject, recipients } from './mail.mjs';

function psQuote(value) {
  return "'" + String(value ?? '').replaceAll("'", "''") + "'";
}

function embedSignatureImages(html) {
  const images = [];
  const converted = String(html).replace(/src\s*=\s*(["'])data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)\1/gi, (original, quote, type, data) => {
    if (data.length > 1800000) return original;
    let entry = images.find(item => item.base64 === data && item.type === type.toLowerCase());
    if (!entry) {
      const index = images.length + 1;
      entry = {
        type: type.toLowerCase(),
        filename: 'bmc-signature-' + index + '.' + (type.toLowerCase() === 'jpeg' ? 'jpg' : 'png'),
        cid: 'bmc-signature-' + index + '@local.invalid',
        base64: data,
      };
      images.push(entry);
    }
    return 'src="cid:' + entry.cid + '"';
  });
  return { html: converted, images };
}

export function renderClassicOutlookScript(html, settings, reportDate) {
  const { html: emailHtml, images } = embedSignatureImages(html);
  // The report remains human-readable inside a PowerShell single-quoted here-string.
  // Avoid a user-controlled line closing the here-string.
  const safeHtml = emailHtml.replace(/\r\n?/g, '\n').replace(/(^|\n)'@/g, '$1&#39;@');
  const imageLines = images.map(image =>
    '    @{ Name = ' + psQuote(image.filename) +
    '; ContentId = ' + psQuote(image.cid) +
    '; Base64 = ' + psQuote(image.base64) + ' }'
  );

  const lines = [
    '# BMC Daily Pivot & Email Report - Classic Outlook draft helper',
    '# Generated locally. Requires installed Classic Outlook with a configured profile.',
    '# Creates an UNSENT draft and a native Unicode .msg file beside this .ps1.',
    '# Does not send email, use credentials, download scripts, or call an API.',
    '$ErrorActionPreference = "Stop"',
    '$html = @' + "'",
    safeHtml,
    "'@",
    '$images = @(',
    ...imageLines,
    ')',
    '$temporaryFiles = New-Object System.Collections.Generic.List[string]',
    'try {',
    '    $outlook = New-Object -ComObject Outlook.Application',
    '    $mail = $outlook.CreateItem(0) # 0 = olMailItem',
    '    $mail.BodyFormat = 2 # 2 = olFormatHTML',
    '    $mail.To = ' + psQuote(recipients(settings.to).join('; ')),
    '    $mail.CC = ' + psQuote(recipients(settings.cc).join('; ')),
    '    $mail.BCC = ' + psQuote(recipients(settings.bcc).join('; ')),
    '    $mail.Subject = ' + psQuote(buildSubject(settings.subject, reportDate)),
    '    $mail.HTMLBody = $html',
    '    foreach ($image in $images) {',
    '        $extension = if ($image.Name.EndsWith(".jpg")) { ".jpg" } else { ".png" }',
    '        $tempFile = Join-Path ([IO.Path]::GetTempPath()) ("BMC-Mail-" + [Guid]::NewGuid().ToString("N") + $extension)',
    '        [IO.File]::WriteAllBytes($tempFile, [Convert]::FromBase64String($image.Base64))',
    '        [void] $temporaryFiles.Add($tempFile)',
    '        $attachment = $mail.Attachments.Add($tempFile, 1, 1, $image.Name)',
    '        $attachment.PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F", [string] $image.ContentId)',
    '        try { $attachment.PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x7FFE000B", $true) } catch {}',
    '    }',
    '    $mail.Save() # Saves to the active Outlook profile Drafts folder',
    '    $target = [IO.Path]::ChangeExtension($PSCommandPath, ".msg")',
    '    $stem = [IO.Path]::Combine([IO.Path]::GetDirectoryName($target), [IO.Path]::GetFileNameWithoutExtension($target))',
    '    $index = 1',
    '    while ([IO.File]::Exists($target)) { $target = $stem + " (" + $index + ").msg"; $index++ }',
    '    $mail.SaveAs($target, 9) # 9 = olMSGUnicode; editable in Classic Outlook',
    '    $mail.Display($false) # Opens compose window for manual review and sending',
    '    Write-Host ("Unsent draft opened in Classic Outlook; native .msg saved to " + $target)',
    '} catch {',
    '    Write-Host ("Could not create the Classic Outlook draft: " + $_.Exception.Message) -ForegroundColor Red',
    '    [void] (Read-Host "Press Enter to close")',
    '    exit 1',
    '} finally {',
    '    foreach ($path in $temporaryFiles) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }',
    '}',
    '',
  ];
  // Windows PowerShell 5.1 needs a UTF-8 BOM to interpret non-ASCII report text.
  return '\uFEFF' + lines.join('\r\n');
}

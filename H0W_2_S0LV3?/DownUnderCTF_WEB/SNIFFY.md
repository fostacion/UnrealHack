# 🕵️‍♂️ sniffy

## 🧪 Challenge Environment

```bash
docker build -t sniffy .
docker run -p 5001:80 sniffy
```
---
📜 Description

A simple PHP-based web service that allows users to play audio clips of kookaburras.
The main functionality revolves around rendering different UI themes and streaming audio files based on user interaction.

---

🧠 Background Knowledge

PHP uses file-based session storage by default.
When a session is started, the server creates a file under a directory like /tmp in the format:
```bash
sess_<session_id>
```
•	The session ID is sent to the client as a cookie (PHPSESSID)

•	Any session variable (e.g., $_SESSION['flag']) is stored inside that file

•	The function mime_content_type() checks the binary signature of a file to infer its MIME type

📚 References:
	
 •	How PHP Sessions Work
 
 https://kb.hosting.com/docs/using-php-sessions
 
 •	MIME Type Reference

---

🧩 Code Analysis

🐳 Dockerfile
``` bash
FROM php:8.3-apache

RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY src/ /var/www/html/
```
🎧 audio.php
```php
$file = 'audio/' . $_GET['f'];

if (!file_exists($file)) {
    http_response_code(404); die;
}

$mime = mime_content_type($file);

if (!$mime || !str_starts_with($mime, 'audio')) {
    http_response_code(403); die;
}

header("Content-Type: $mime");
readfile($file);
```
✅ Key Behavior:
	•	Only files under audio/ are allowed
	•	MIME type must start with audio, otherwise access is denied

---

🌈 index.php
```php
<?php

include 'flag.php';

function theme() {
    return $_SESSION['theme'] == "dark" ? "dark" : "light";
}

function other_theme() {
    return $_SESSION['theme'] == "dark" ? "light" : "dark";
}

session_start();

$_SESSION['flag'] = FLAG;

$_SESSION['theme'] = $_GET['theme'] ?? $_SESSION['theme'] ?? 'light';


?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>sniffy</title>
    
    <link rel="stylesheet" href="/css/style-<?= theme() ?>.css" id="theme-style">
    
    <script src="/js/script.js" defer></script>
</head>
<body>
    <div class="container">
        <header>
            <h1>sniffy</h1>
            <p>kookaburra wildlife sanctuary</p>

            <div class="theme-switcher">
                <a href="/?theme=<?= other_theme() ?>">
                    <img src="/img/<?= other_theme() ?>.svg" width="25px" alt="<?= other_theme() ?> mode" id="<?= other_theme() ?>-icon">
                </a>
            </div>
        </header>

        <main>
            <p>listen to the sounds of our kookaburras</p>
            <div class="buttons">
<?php

foreach(scandir('audio/') as $v) {
    if ($v == '.' || $v == '..') continue;


    echo "                <img src='/img/play-" . other_theme() . ".svg' width='40px' onclick=\"playAudio('/audio.php?f=$v');\"/>\n";
}
?>
            </div>
        </main>
    </div>
</body>
</html>
```
✅ Highlights:
	•	The flag is stored only in the session
	•	The session file will be created when visiting index.php, but only for the initiating client
 
---

🧨 Exploitation Strategy

🕳️ Vulnerability Summary
	1.	The flag is stored in $_SESSION['flag'] inside the server’s sess_<id> file.
	2.	The file is created upon visiting index.php.
	3.	audio.php streams files only if their MIME type starts with audio.
	4.	But mime_content_type() uses magic bytes, so certain non-audio files can masquerade as audio if their header matches a known audio signature.
	5.	If we manage to craft a valid request to audio.php?f=../../../../tmp/sess_<victim_session_id>, and the session file appears as an audio file, the server will stream its content.

---

🛠️ Exploitation Steps

1. 🔍 Trigger Session File Creation

Visit /index.php to create your own session.
However, this flag is not stored in your session — it’s only in the server’s own local session tied to that initial request.

💡 The target session ID is the one that holds $_SESSION['flag'].

---

2. 🎭 Find MIME Spoofable Headers

Use magic.mime to identify file signatures that mime_content_type() will interpret as audio.

Examples:
```markdown
| Magic Bytes | MIME Type         |
|-------------|-------------------|
| M.K.        | audio/mod         |
| M!K!        | audio/mod         |
| FLT4        | audio/mod         |
| 16CN        | audio/x-canon-mod |
```
Session files starting with one of these might bypass the MIME check.

---

3. 🗂️ Locate the Session File

If file path traversal is allowed:
```bash
GET /audio.php?f=../../../../tmp/sess_<session_id>
```
Check whether the response returns HTTP 200 and starts with a valid audio MIME.

If successful, you’ll get a full dump of the session content — including:
```bash
flag|s:10:"DUCTF{...}";
```
🔐 Defense Notes

To prevent this type of attack:
	•	Don’t store secrets (e.g., flags) in user-accessible session files
	•	Use session.save_path outside of web-accessible or guessable locations
	•	Never trust mime_content_type() alone — validate both MIME and extension
	•	Consider using a whitelist of allowed filenames rather than allowing user-controlled paths

---

📎 Summary

This challenge highlights a non-obvious vulnerability combining:
	•	PHP session file behavior
	•	MIME type spoofing via magic bytes
	•	Directory traversal
	•	Insecure file disclosure through content-type filtering

A great example of how minor implementation details can lead to full compromise 🚩

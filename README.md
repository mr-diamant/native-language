# Native Language

Daily English practice PWA: 3 words per day, sentence generation, offline storage.

## Production notes

- `api.php` calls OpenAI through a server-side proxy. Browser never sees the API key.
- Create `config.local.php` on the server (not tracked in Git) with your real OpenAI key:

```php
<?php
define('OPENAI_API_KEY', 'sk-...');
```

- `config.php` in the repo has an empty placeholder key.

## Deploy

Files are plain HTML/CSS/JS + PHP. Upload everything except `.git` to a shared-hosting subfolder.

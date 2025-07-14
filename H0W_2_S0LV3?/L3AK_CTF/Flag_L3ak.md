# 🛡️ CTF Challenge: L3AK_CTF - Flag_L3ak

**URL**: [http://34.134.162.213:17000](http://34.134.162.213:17000)  / [L3AK_CTF2025](https://ctf.l3ak.team/challenges)

**Category**: Web  
**Difficulty**: ★☆☆☆☆

---

## 🧠 Description

We are presented with a blog application that includes a basic search functionality. Our goal is to retrieve the real flag stored internally on the server.

> _"What's the name of this CTF? Yk what to do 😉"_

---

## 🔍 Initial Recon

Visiting the main page reveals a standard blog with a few posts. Upon inspecting the code and endpoints, we find three API routes:

---

## 📑 API Summary

### `/`
Serves the main HTML page.

---

### `/api/posts`

- Returns all blog posts.
- Any real flag string is **masked** with asterisks (`*`).
- Example:
  ```json
  {
    "content": "Well luckily the content of the flag is hidden so here it is: ********************"
  }

---

### /api/search
	
•	Accepts a POST request with a query parameter.
 
•	The query must be exactly 3 characters long.
 
•	Filters posts where the title, content, or author contains the substring.
 
•	Any instance of the real flag is masked in the output.

---

🧱 Source Code (Core Logic)
  ```python
const FLAG = 'L3AK{t3mp_flag!!}';

app.post('/api/search', (req, res) => {
   const { query } = req.body;
   if (!query || typeof query !== 'string' || query.length !== 3) {
       return res.status(400).json({ error: 'Query must be 3 characters.' });
   }

   const matchingPosts = posts
       .filter(post => post.title.includes(query) || post.content.includes(query) || post.author.includes(query))
       .map(post => ({
           ...post,
           content: post.content.replace(FLAG, '*'.repeat(FLAG.length))
       }));

   res.json({ results: matchingPosts });
});
  ```

---

🚨 Vulnerability Analysis

•	The real flag is stored in memory as plaintext.

•	Although /api/posts masks it, /api/search still performs filtering before masking.

•	Therefore, if the search query matches part of the real flag, the response will contain a result — allowing us to determine matching substrings.

---

🧨 Exploitation Plan

1.	We know the flag format: L3AK{...}
2.	Only 3-character queries are allowed.
3.	We brute-force one 3-letter substring at a time and observe if the count of results increases (i.e., search hits).
4.	We reconstruct the flag by chaining matched substrings.

---

✅ Takeaways
	•	Even if sensitive data is masked in output, search-based inference attacks can reveal it.
	•	Always sanitize and protect search logic when handling sensitive internal values.
	•	Limit queryability or use token-based results rather than direct string matching on secure content.

---

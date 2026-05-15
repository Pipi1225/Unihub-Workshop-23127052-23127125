# Get JWT from localStorage (copy-paste)

1. Open the web app in Chrome/Edge and log in.
2. Open DevTools -> Console.
3. Paste this:

```js
(() => {
  const token = localStorage.getItem("token");
  if (!token) {
    console.log("No token in localStorage");
    return;
  }
  console.log("STUDENT_TOKEN:");
  console.log(token);
})();
```

4. Copy the printed token and set it in `test_scripts/.env`:

```
STUDENT_TOKEN="<jwt>"
```

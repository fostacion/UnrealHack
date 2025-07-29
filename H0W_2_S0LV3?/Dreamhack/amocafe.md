# ☕️ Amo Cafe

## Challenge Overview

**Challenge Name**: Amo Cafe  
**Platform**: DreamHack  
**Category**: Web  
**Description**: A web service where you can order by entering menu numbers. Need to find Amo's favorite menu number by analyzing the source code to get the flag.

## Initial Analysis

### Source Code Analysis

```python
#!/usr/bin/env python3
from flask import Flask, request, render_template

app = Flask(__name__)

try:
    FLAG = open("./flag.txt", "r").read()
except:
    FLAG = "[**FLAG**]"

@app.route('/', methods=['GET', 'POST'])
def index():
    menu_str = ''
    org = FLAG[10:29]  # Extract 19 characters from flag
    org = int(org)     # Convert to integer
    st = ['' for i in range(16)]

    for i in range (0, 16):
        res = (org >> (4 * i)) & 0xf 
        if 0 < res < 12:
            if ~res & 0xf == 0x4:  # res == 11 (binary: 1011)
                st[16-i-1] = '_'
            else:
                st[16-i-1] = str(res)
        else:
            st[16-i-1] = format(res, 'x')
    menu_str = menu_str.join(st)

    if request.method == "POST":
        input_str = request.form.get("menu_input", "")
        if input_str == str(org):
            return render_template('index.html', menu=menu_str, flag=FLAG)
        return render_template('index.html', menu=menu_str, flag='try again...')
    
    return render_template('index.html', menu=menu_str)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
```

## Vulnerability Analysis

### Key Logic Understanding

1. **Flag Processing**: 
   - Extracts `FLAG[10:29]` (19 characters) and converts to integer `org`
   
2. **Menu String Generation**:
   - Splits `org` into 16 nibbles (4-bit chunks)
   - Each nibble is processed as follows:
     - If `0 < res < 12`: Convert to string or '_' (when res=11)
     - Otherwise: Convert to hexadecimal
   - Arranges in reverse order (MSB first)

3. **Win Condition**:
   - Input must match `str(org)` exactly to get the flag

### Bit Operations Breakdown

```python
res = (org >> (4 * i)) & 0xf
```
- `org >> (4 * i)`: Right shift by 4*i bits
- `& 0xf`: Mask to get only the rightmost 4 bits (nibble)

```python
if ~res & 0xf == 0x4:  # When res == 11 (binary: 1011)
    st[16-i-1] = '_'
```
- `~res`: Bitwise NOT of res
- When res = 11 (1011), ~res = 4 (0100), so condition becomes true

### Understanding the Encoding Process

The algorithm does the following:
1. Takes a 64-bit integer (`org`)
2. Extracts each 4-bit nibble from right to left
3. Converts each nibble according to rules:
   - Nibble 0: → '0' (hex)
   - Nibbles 1-11: → '1'-'9', '_' (for 11)
   - Nibbles 12-15: → 'c', 'd', 'e', 'f' (hex)
4. Places results in reverse order (MSB first)

## Exploitation

### Step 1: Analyze the Hint String

When accessing the web service, we get a hint string displayed as the menu. For example:
```
1_c_3_c_0__ff_3e
```

### Step 2: Reverse Engineering

To convert the hint back to the original integer:

1. **Replace '_' with 'b'**: Since '_' represents nibble value 11 (hex 'b')
   ```
   1_c_3_c_0__ff_3e → 1bcb3bcb0bbffb3e
   ```

2. **Convert hex to decimal**: 
   ```python
   hex_string = "1bcb3bcb0bbffb3e"
   org = int(hex_string, 16)
   print(org)  # Output: 2002760202557848382
   ```

### Step 3: Submit the Answer

Enter the calculated decimal value in the menu input field to get the flag.

## Exploit Code

```python
#!/usr/bin/env python3

def menu_to_org(menu_str):
    """
    Convert menu hint string back to original integer
    """
    # Replace '_' with 'b' (since _ represents nibble value 11)
    hex_string = menu_str.replace('_', 'b')
    
    # Convert hex to decimal
    org = int(hex_string, 16)
    return org

def verify_conversion(org):
    """
    Verify our conversion by recreating the menu string
    """
    st = ['' for i in range(16)]
    
    for i in range(0, 16):
        res = (org >> (4 * i)) & 0xf
        if 0 < res < 12:
            if ~res & 0xf == 0x4:  # res == 11
                st[16-i-1] = '_'
            else:
                st[16-i-1] = str(res)
        else:
            st[16-i-1] = format(res, 'x')
    
    return ''.join(st)

# Example usage
if __name__ == "__main__":
    # Example hint string from the web service
    hint = "1_c_3_c_0__ff_3e"
    
    print(f"Hint string: {hint}")
    
    # Convert to original integer
    original_number = menu_to_org(hint)
    print(f"Original number: {original_number}")
    
    # Verify our conversion
    recreated_hint = verify_conversion(original_number)
    print(f"Recreated hint: {recreated_hint}")
    print(f"Match: {hint == recreated_hint}")
    
    print(f"\nSubmit this number to get the flag: {original_number}")
```

## Step-by-Step Solution

### Manual Calculation Example

Given hint string: `1_c_3_c_0__ff_3e`

1. **Convert to hex**: `1bcb3bcb0bbffb3e`
2. **Calculate decimal**:
   ```python
   >>> int("1bcb3bcb0bbffb3e", 16)
   2002760202557848382
   ```
3. **Submit**: Enter `2002760202557848382` in the input field
4. **Get flag**: Server returns the flag

### Automated Solution

```python
import requests

def solve_amo_cafe(url):
    # Get the hint string
    response = requests.get(url)
    # Parse menu_str from HTML (implementation depends on HTML structure)
    
    # Convert hint to original number
    hint = "1_c_3_c_0__ff_3e"  # extracted from response
    answer = menu_to_org(hint)
    
    # Submit answer
    data = {"menu_input": str(answer)}
    response = requests.post(url, data=data)
    
    return response.text
```

## Key Concepts Learned

### Bit Manipulation
- **Nibble extraction**: Using right shift and mask operations
- **Bitwise NOT**: Understanding complement operations
- **Endianness**: MSB vs LSB ordering in data representation

### Reverse Engineering Process
1. **Code analysis**: Understanding the encoding algorithm
2. **Pattern recognition**: Identifying the transformation rules
3. **Inverse operation**: Implementing the reverse transformation
4. **Verification**: Testing the solution against known inputs

### Web Application Security
- **Source code disclosure**: When source code is available for analysis
- **Logic flaws**: Exploiting algorithmic weaknesses
- **Input validation**: Understanding server-side checks

## Conclusion

This challenge demonstrates the importance of:
- Understanding bit manipulation operations
- Reverse engineering skills
- Pattern recognition in encoded data
- Systematic approach to problem solving

The vulnerability lies in the predictable encoding scheme that can be easily reversed when the algorithm is known, highlighting the importance of using cryptographically secure methods for sensitive data protection.

**Flag Format**: `DH{...}`

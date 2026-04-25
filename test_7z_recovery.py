s = 'Ҽ(Prog & etc)//.txt'
recovered_bytes = bytearray()
for c in s:
    cp = ord(c)
    if 0xEF00 <= cp <= 0xEFFF:
        recovered_bytes.append(cp & 0xFF)
    else:
        recovered_bytes.extend(c.encode('utf-8'))

print("Recovered hex:", recovered_bytes.hex())
print("Decoded as CP949:", recovered_bytes.decode('cp949', errors='replace'))

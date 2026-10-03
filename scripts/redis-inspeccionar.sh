#!/usr/bin/env bash
# Muestra las llaves producto:* con su TTL y su valor.
# TTL -1 = llave sin expiración (no debería ocurrir, ver R6); -2 = la llave ya no existe.
source "$(dirname "$0")/_comun.sh"

marca "Llaves en caché: $(redis_cli DBSIZE)"
# SCAN en lugar de KEYS para no bloquear Redis (buena práctica aunque aquí haya pocas llaves).
redis_cli --scan --pattern 'producto:*' | sort -t: -k2 -n | while read -r llave; do
  printf '%-14s TTL=%-5s %s\n' "$llave" "$(redis_cli TTL "$llave")" "$(redis_cli GET "$llave")"
done

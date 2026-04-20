type ReceiptActualDebugExportFixture = {
    fileName: string
    sourceDocumentId: string
    expectedTotalAmountMinor: number
    expectedDisplayAmount: string
    expectedSupplierName: string
    normalizedLines: string[]
    reconstructedReceiptLines: string[]
}

function splitReceiptDebugLines(value: string): string[] {
    return value.trim().split('\n')
}

const dmNormalizedLines = splitReceiptDebugLines(String.raw`
I
dm
dr
g.r;o
I
Vri
NA
t,
i0M
i-0f
llAl'r,tiPuli
r
iuR
=
?4.06
clF"
04,ri4,?026
1?:26:ili
F0e0/2
il???04/?
i5?5
I)EFI[{I4IT
dez.tist,25
2 x
39,90
BENltI'iiT
v,
kan,500rtrl
7
't
29,90
t]t|'ilfilT
vnd,k,250ml
4
rt
?9,$0
.-
[,[Nl{tt,
nzutra],2lj0rni
[
'4
x
?9,'90
0l'l
TASI{A
irevnd
1ks
IIJR
tlZT;
3,:t?
19,80
2,49
59,8il
4,
!J
i
1$,0iJ
4,9/
11!,uil
0,4i
$,'i0
1
telkr
\
16,1$
ffi,ffi
VI$A
ili!(
Sazaa
DPtj
!
=?l
,
ti0fr
3fffi,
70
ilerkem
IAilari
fifi]
3fi8,
?il
3?]
,
?4
tjpla{i6nim
edkatnickd
karty
hystn
za
tento
ndkup
ziskal
j
l5
dn
active
beauty
b.
dirr
drugerie
markt
s,r,n.
F,
A,
fierstnera
?]51i'6,
f,eskd
Eucidjovjce
$ptll,
zapn.
|{$
v
tE
crdd,
C
vl,
;1$35
0lt:
Cl4i?39581
iil0:
4i?395U1
Dpri
6i,46
`)

const dmReconstructedReceiptLines = splitReceiptDebugLines(String.raw`
I
dm
dr
g.r;o
Vri
NA
t,
i0M
i-0f
llAl'r,tiPuli
r
iuR
=
?4.06
clF"
04,ri4,?026
1?:26:ili
F0e0/2
il???04/?
i5?5
I)EFI[{I4IT
dez.tist,25
2 x
39,90
BENltI'iiT
v,
kan,500rtrl
7
't
29,90
t]t|'ilfilT
vnd,k,250ml
4
rt
?9,$0
.-
[,[Nl{tt,
nzutra],2lj0rni
[
'4
x
?9,'90
0l'l
TASI{A
irevnd
1ks
IIJR
tlZT;
3,:t?
19,80
2,49
59,8il
4,
!J
i
1$,0iJ
4,9/
11!,uil
0,4i
$,'i0
1
telkr
\
16,1$
ffi,ffi
VI$A
ili!(
Sazaa
DPtj
!
=?l
,
ti0fr
3fffi,
70
ilerkem
IAilari
fifi]
3fi8,
?il
3?]
?4
tjpla{i6nim
edkatnickd
karty
hystn
za
tento
ndkup
ziskal
j
l5
dn
active
beauty
b.
dirr
drugerie
markt
s,r,n.
F,
A,
fierstnera
?]51i'6,
f,eskd
Eucidjovjce
$ptll,
zapn.
|{$
v
tE
crdd,
C
vl,
;1$35
0lt:
Cl4i?39581
iil0:
4i?395U1
Dpri
6i,46
t, i0M i-0f llAl'r,tiPuli r iuR = 74.06
i0M i-0f llAl'r,tiPuli r iuR = 74.06
i0M i-0f llAl'r,tiPuli r iuR = 74.06 clF"
i-0f llAl'r,tiPuli r iuR = 74.06
i-0f llAl'r,tiPuli r iuR = 74.06 clF"
i-0f llAl'r,tiPuli r iuR = 74.06 clF" 04,ri4,7026
llAl'r,tiPuli r iuR = 74.06
llAl'r,tiPuli r iuR = 74.06 clF"
llAl'r,tiPuli r iuR = 74.06 clF" 04,ri4,7026
llAl'r,tiPuli r iuR = 74.06 clF" 04,ri4,7026 17:26:ili
r iuR = 74.06
r iuR = 74.06 clF"
r iuR = 74.06 clF" 04,ri4,7026
r iuR = 74.06 clF" 04,ri4,7026 17:26:ili
r iuR = 74.06 clF" 04,ri4,7026 17:26:ili F0e0/2
iuR = 74.06
iuR = 74.06 clF"
iuR = 74.06 clF" 04,ri4,7026
iuR = 74.06 clF" 04,ri4,7026 17:26:ili
iuR = 74.06 clF" 04,ri4,7026 17:26:ili F0e0/2
iuR = 74.06 clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7
= 74.06
= 74.06 clF"
= 74.06 clF" 04,ri4,7026
= 74.06 clF" 04,ri4,7026 17:26:ili
= 74.06 clF" 04,ri4,7026 17:26:ili F0e0/2
= 74.06 clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7
= 74.06 clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575
74.06 clF"
74.06 clF" 04,ri4,7026
74.06 clF" 04,ri4,7026 17:26:ili
74.06 clF" 04,ri4,7026 17:26:ili F0e0/2
74.06 clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7
74.06 clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575
74.06 clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT
clF" 04,ri4,7026 17:26:ili
clF" 04,ri4,7026 17:26:ili F0e0/2
clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7
clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575
clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT
clF" 04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25
04,ri4,7026 17:26:ili
04,ri4,7026 17:26:ili F0e0/2
04,ri4,7026 17:26:ili F0e0/2 il77704/7
04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575
04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT
04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25
04,ri4,7026 17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x
17:26:ili F0e0/2
17:26:ili F0e0/2 il77704/7
17:26:ili F0e0/2 il77704/7 i575
17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT
17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25
17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x
17:26:ili F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x 39,90
F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25
F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x
F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x 39,90
F0e0/2 il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT
il77704/7 i575 I)E8[{I4IT dez.tist,25
il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x
il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x 39,90
il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT
il77704/7 i575 I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT v,
i575 I)E8[{I4IT dez.tist,25
i575 I)E8[{I4IT dez.tist,25 2 x
i575 I)E8[{I4IT dez.tist,25 2 x 39,90
i575 I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT
i575 I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT v,
i575 I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT v, kan,500rtrl
I)E8[{I4IT dez.tist,25
I)E8[{I4IT dez.tist,25 2 x
I)E8[{I4IT dez.tist,25 2 x 39,90
I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT
I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT v,
I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT v, kan,500rtrl
I)E8[{I4IT dez.tist,25 2 x 39,90 BENltI'iiT v, kan,500rtrl 7
dez.tist,25 2 x
dez.tist,25 2 x 39,90
dez.tist,25 2 x 39,90 BENltI'iiT
dez.tist,25 2 x 39,90 BENltI'iiT v,
dez.tist,25 2 x 39,90 BENltI'iiT v, kan,500rtrl
dez.tist,25 2 x 39,90 BENltI'iiT v, kan,500rtrl 7
dez.tist,25 2 x 39,90 BENltI'iiT v, kan,500rtrl 7 't
2 x 39,90
2 x 39,90 BENltI'iiT
2 x 39,90 BENltI'iiT v,
2 x 39,90 BENltI'iiT v, kan,500rtrl
2 x 39,90 BENltI'iiT v, kan,500rtrl 7
2 x 39,90 BENltI'iiT v, kan,500rtrl 7 't
2 x 39,90 BENltI'iiT v, kan,500rtrl 7 't 29,90
39,90 BENltI'iiT
39,90 BENltI'iiT v,
39,90 BENltI'iiT v, kan,500rtrl
39,90 BENltI'iiT v, kan,500rtrl 7
39,90 BENltI'iiT v, kan,500rtrl 7 't
39,90 BENltI'iiT v, kan,500rtrl 7 't 29,90
39,90 BENltI'iiT v, kan,500rtrl 7 't 29,90 t]t|'il8lT
BENltI'iiT v, kan,500rtrl 7 't 29,90
BENltI'iiT v, kan,500rtrl 7 't 29,90 t]t|'il8lT
BENltI'iiT v, kan,500rtrl 7 't 29,90 t]t|'il8lT vnd,k,250ml
v, kan,500rtrl 7 't 29,90
v, kan,500rtrl 7 't 29,90 t]t|'il8lT
v, kan,500rtrl 7 't 29,90 t]t|'il8lT vnd,k,250ml
v, kan,500rtrl 7 't 29,90 t]t|'il8lT vnd,k,250ml 4
kan,500rtrl 7 't 29,90
kan,500rtrl 7 't 29,90 t]t|'il8lT
kan,500rtrl 7 't 29,90 t]t|'il8lT vnd,k,250ml
kan,500rtrl 7 't 29,90 t]t|'il8lT vnd,k,250ml 4
kan,500rtrl 7 't 29,90 t]t|'il8lT vnd,k,250ml 4 rt
7 't 29,90
7 't 29,90 t]t|'il8lT
7 't 29,90 t]t|'il8lT vnd,k,250ml
7 't 29,90 t]t|'il8lT vnd,k,250ml 4
7 't 29,90 t]t|'il8lT vnd,k,250ml 4 rt
7 't 29,90 t]t|'il8lT vnd,k,250ml 4 rt 79,$0
't 29,90
't 29,90 t]t|'il8lT
't 29,90 t]t|'il8lT vnd,k,250ml
't 29,90 t]t|'il8lT vnd,k,250ml 4
't 29,90 t]t|'il8lT vnd,k,250ml 4 rt
't 29,90 t]t|'il8lT vnd,k,250ml 4 rt 79,$0
't 29,90 t]t|'il8lT vnd,k,250ml 4 rt 79,$0 .-
29,90 t]t|'il8lT
29,90 t]t|'il8lT vnd,k,250ml
29,90 t]t|'il8lT vnd,k,250ml 4
29,90 t]t|'il8lT vnd,k,250ml 4 rt
29,90 t]t|'il8lT vnd,k,250ml 4 rt 79,$0
29,90 t]t|'il8lT vnd,k,250ml 4 rt 79,$0 .-
29,90 t]t|'il8lT vnd,k,250ml 4 rt 79,$0 .- [,[Nl{tt,
0l'l TASI{A irevnd 1ks IIJR tlZT; 3,:t7 19,80
TASI{A irevnd 1ks IIJR tlZT; 3,:t7 19,80
TASI{A irevnd 1ks IIJR tlZT; 3,:t7 19,80 2,49
irevnd 1ks IIJR tlZT; 3,:t7 19,80
irevnd 1ks IIJR tlZT; 3,:t7 19,80 2,49
irevnd 1ks IIJR tlZT; 3,:t7 19,80 2,49 59,8il
1ks IIJR tlZT; 3,:t7 19,80
1ks IIJR tlZT; 3,:t7 19,80 2,49
1ks IIJR tlZT; 3,:t7 19,80 2,49 59,8il
1ks IIJR tlZT; 3,:t7 19,80 2,49 59,8il 4,
IIJR tlZT; 3,:t7 19,80
IIJR tlZT; 3,:t7 19,80 2,49
IIJR tlZT; 3,:t7 19,80 2,49 59,8il
IIJR tlZT; 3,:t7 19,80 2,49 59,8il 4,
IIJR tlZT; 3,:t7 19,80 2,49 59,8il 4, !J
tlZT; 3,:t7 19,80
tlZT; 3,:t7 19,80 2,49
tlZT; 3,:t7 19,80 2,49 59,8il
tlZT; 3,:t7 19,80 2,49 59,8il 4,
tlZT; 3,:t7 19,80 2,49 59,8il 4, !J
tlZT; 3,:t7 19,80 2,49 59,8il 4, !J i
3,:t7 19,80
3,:t7 19,80 2,49
3,:t7 19,80 2,49 59,8il
3,:t7 19,80 2,49 59,8il 4,
3,:t7 19,80 2,49 59,8il 4, !J
3,:t7 19,80 2,49 59,8il 4, !J i
3,:t7 19,80 2,49 59,8il 4, !Ji1$,0iJ
19,80 2,49
19,80 2,49 59,8il
19,80 2,49 59,8il 4,
19,80 2,49 59,8il 4, !J
19,80 2,49 59,8il 4, !J i
19,80 2,49 59,8il 4, !Ji1$,0iJ
19,80 2,49 59,8il 4, !Ji1$,0iJ 4,9/
2,49 59,8il
2,49 59,8il 4,
2,49 59,8il 4, !J
2,49 59,8il 4, !J i
2,49 59,8il 4, !Ji1$,0iJ
2,49 59,8il 4, !Ji1$,0iJ 4,9/
2,49 59,8il 4, !Ji1$,0iJ 4,9/ 11!,uil
Sazaa DPtj ! =7l , ti0fr 3ff8, 70
DPtj ! =7l , ti0fr 3ff8, 70
DPtj ! =7l , ti0fr 3ff8, 70 ilerkem
! =7l , ti0fr 3ff8, 70
! =7l , ti0fr 3ff8, 70 ilerkem
! =7l , ti0fr 3ff8, 70 ilerkem IAilari
=7l , ti0fr 3ff8, 70
=7l , ti0fr 3ff8, 70 ilerkem
=7l , ti0fr 3ff8, 70 ilerkem IAilari
=7l , ti0fr 3ff8, 70 ilerkem IAilari 88]
, ti0fr 3ff8, 70
, ti0fr 3ff8, 70 ilerkem
, ti0fr 3ff8, 70 ilerkem IAilari
, ti0fr 3ff8, 70 ilerkem IAilari 88]
, ti0fr 3ff8, 70 ilerkem IAilari 88] 388,
ti0fr 3ff8, 70
ti0fr 3ff8, 70 ilerkem
ti0fr 3ff8, 70 ilerkem IAilari
ti0fr 3ff8, 70 ilerkem IAilari 88]
ti0fr 3ff8, 70 ilerkem IAilari 88] 388,
ti0fr 3ff8, 70 ilerkem IAilari 88] 388, 7il
3ff8, 70
3ff8, 70 ilerkem
3ff8, 70 ilerkem IAilari
3ff8, 70 ilerkem IAilari 88]
3ff8, 70 ilerkem IAilari 88] 388,
3ff8, 70 ilerkem IAilari 88] 388, 7il
3ff8, 70 ilerkem IAilari 88] 388, 7il 37]
vl, ;1$35 0lt: Cl4i739581 iil0: 4i7395U1 Dpri 6i,46
;1$35 0lt: Cl4i739581 iil0: 4i7395U1 Dpri 6i,46
0lt: Cl4i739581 iil0: 4i7395U1 Dpri 6i,46
Cl4i739581 iil0: 4i7395U1 Dpri 6i,46
iil0: 4i7395U1 Dpri 6i,46
4i7395U1 Dpri 6i,46
Dpri 6i,46
`)

const tescoNormalizedLines = splitReceiptDebugLines(String.raw`
TESCO
T
Vr^6ovlck6
r^.
A
raha
10
*",
ilypr.rr.ket
pra
l:ro
VAN
0x.pR.oDs.s.sJos
sss,#ne
sot'l
OLASS.T.CTT
ri
pvi
ijo,illbi';315'
42e,soA
rnro
oolpilE
eoJfdeo
Ko
Es,4oA
crr
uu8u*rnril
zs8frie0
Kd
4s7,4oA
r^uo
,rfuil
boorr
8e'eo
K6
44s,ooA
rouo
uofl.ilor.zoor?e,to
K,
oes,60A
*
ourufr*rrow.r,84ieo
Ko
s7e,60A
pERsrL
3rl
.our.r33'eo
Kc
117,80A
Ts
L$
rF
iu,r,
,f$fl'no
*o
eTe,BoA
4 x
99,90
Kd
999,60A
14EZISOUEEl
cc-Feniii'arl
LA'o
"
4,19?'?9
cc
sou-clnds.
rl6ii'X
-1!g,qq
cc,
v;ii.oilFi:Uili.i
_38;83
corkove
uspona
_sio,oo
';iiffi-"--
pi;f6b'nr
rerte
3133;fB
Sazba
ztx--
,*?l!
,r8ilb8l
===============:===
_-_Jyuz
tie
-;il;;=;
iffi;;;:
T;;;;;;
:
=
**xx*x*txx*x*
t*xxx*)
_
s.
clugc;R'"
jli;
^il:tiliXiii-.t;:ffi
-
-;i:Fti?il;ffi
:.....ililllllilruU;.
Bodu
v
t6to
trens
___
sinu
piriii
riirfiii"ffi
'
,o$t
===:==:====*5===5g==
?i;?,
eilil
"
il,
il
;
il
=
iltr#;Lt,t;,;ti
i
Karta:
urro
u'sa
con
iiibi-n006d6000s1010
xxxx
xxxx,lxx;-r:8li
cz'
sTaz,do
Pt-odeJ
___
PIN
oK
___
59
llllt
ill
|llflfll
fllf
lill
2
L0I9
0044
`)

const tescoReconstructedReceiptLines = splitReceiptDebugLines(String.raw`
TESCO
T
Vr^6ovlck6
r^.
A
raha
10
*",
ilypr.rr.ket
pra
l:ro
VAN
0x.pR.oDs.s.sJos
sss,#ne
sot'l
OLASS.T.CTT
ri
pvi
ijo,illbi';315'
42e,soA
rnro
oolpilE
eoJfdeo
Ko
Es,4oA
crr
uu8u*rnril
zs8frie0
Kd
4s7,4oA
r^uo
,rfuil
boorr
8e'eo
K6
44s,ooA
rouo
uofl.ilor.zoor?e,to
K,
oes,60A
*
ourufr*rrow.r,84ieo
s7e,60A
pERsrL
3rl
.our.r33'eo
Kc
117,80A
Ts
L$
rF
iu,r,
,f$fl'no
*o
eTe,BoA
4 x
99,90
999,60A
14EZISOUEEl
cc-Feniii'arl
LA'o
"
4,19?'?9
cc
sou-clnds.
rl6ii'X
-1!g,qq
cc,
v;ii.oilFi:Uili.i
_38;83
corkove
uspona
_sio,oo
';iiffi-"--
pi;f6b'nr
rerte
3133;fB
Sazba
ztx--
,*?l!
,r8ilb8l
===============:===
_-_Jyuz
tie
-;il;;=;
iffi;;;:
T;;;;;;
:
=
**xx*x*txx*x*
t*xxx*)
_
s.
clugc;R'"
jli;
^il:tiliXiii-.t;:ffi
-
-;i:Fti?il;ffi
:.....ililllllilruU;.
Bodu
v
t6to
trens
___
sinu
piriii
riirfiii"ffi
'
,o$t
===:==:====*5===5g==
?i;?,
eilil
il,
il
;
iltr#;Lt,t;,;ti
i
Karta:
urro
u'sa
con
iiibi-n006d6000s1010
xxxx
xxxx,lxx;-r:8li
cz'
sTaz,do
Pt-odeJ
PIN
oK
59
llllt
ill
|llflfll
fllf
lill
2
L0I9
0044
ourufr*rrow.r,84ieo Ko s7e,60A pERsrL 3rl .our.r33'eo Kc 117,80A
Ko s7e,60A pERsrL 3rl .our.r33'eo Kc 117,80A
Ko s7e,60A pERsrL 3rl .our.r33'eo Kc 117,80A Ts
s7e,60A pERsrL 3rl .our.r33'eo Kc 117,80A
s7e,60A pERsrL 3rl .our.r33'eo Kc 117,80A Ts
s7e,60A pERsrL 3rl .our.r33'eo Kc 117,80A Ts L$
pERsrL 3rl .our.r33'eo Kc 117,80A
pERsrL 3rl .our.r33'eo Kc 117,80A Ts
pERsrL 3rl .our.r33'eo Kc 117,80A Ts L$
pERsrL 3rl .our.r33'eo Kc 117,80A Ts L$ rF
3rl .our.r33'eo Kc 117,80A
3rl .our.r33'eo Kc 117,80A Ts
3rl .our.r33'eo Kc 117,80A Ts L$
3rl .our.r33'eo Kc 117,80A Ts L$ rF
3rl .our.r33'eo Kc 117,80A Ts L$ rF iu,r,
.our.r33'eo Kc 117,80A
.our.r33'eo Kc 117,80A Ts
.our.r33'eo Kc 117,80A Ts L$
.our.r33'eo Kc 117,80A Ts L$ rF
.our.r33'eo Kc 117,80A Ts L$ rF iu,r,
.our.r33'eo Kc 117,80A Ts L$ rF iu,r, ,f$fl'no
Kc 117,80A
Kc 117,80A Ts
Kc 117,80A Ts L$
Kc 117,80A Ts L$ rF
Kc 117,80A Ts L$ rF iu,r,
Kc 117,80A Ts L$ rF iu,r, ,f$fl'no
Kc 117,80A Ts L$ rF iu,r, ,f$fl'no *o
117,80A Ts
117,80A Ts L$
117,80A Ts L$ rF
117,80A Ts L$ rF iu,r,
117,80A Ts L$ rF iu,r, ,f$fl'no
117,80A Ts L$ rF iu,r, ,f$fl'no *o
117,80A Ts L$ rF iu,r, ,f$fl'no *o eTe,BoA
L$ rF iu,r, ,f$fl'no *o eTe,BoA 4 x 99,90
rF iu,r, ,f$fl'no *o eTe,BoA 4 x 99,90
rF iu,r, ,f$fl'no *o eTe,BoA 4 x 99,90 Kd
iu,r, ,f$fl'no *o eTe,BoA 4 x 99,90
iu,r, ,f$fl'no *o eTe,BoA 4 x 99,90 Kd
iu,r, ,f$fl'no *o eTe,BoA 4 x 99,90 Kd 999,60A
,f$fl'no *o eTe,BoA 4 x 99,90
,f$fl'no *o eTe,BoA 4 x 99,90 Kd
,f$fl'no *o eTe,BoA 4 x 99,90 Kd 999,60A
,f$fl'no *o eTe,BoA 4 x 99,90 Kd 999,60A 14EZISOUEEl
*o eTe,BoA 4 x 99,90
*o eTe,BoA 4 x 99,90 Kd
*o eTe,BoA 4 x 99,90 Kd 999,60A
*o eTe,BoA 4 x 99,90 Kd 999,60A 14EZISOUEEl
*o eTe,BoA 4 x 99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl
eTe,BoA 4 x 99,90
eTe,BoA 4 x 99,90 Kd
eTe,BoA 4 x 99,90 Kd 999,60A
eTe,BoA 4 x 99,90 Kd 999,60A 14EZISOUEEl
eTe,BoA 4 x 99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl
eTe,BoA 4 x 99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o
4 x 99,90
4 x 99,90 Kd
4 x 99,90 Kd 999,60A
4 x 99,90 Kd 999,60A 14EZISOUEEl
4 x 99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl
4 x 99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o
4 x 99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o "
99,90 Kd
99,90 Kd 999,60A
99,90 Kd 999,60A 14EZISOUEEl
99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl
99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o
99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o "
99,90 Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o " 4,197'79
Kd 999,60A
Kd 999,60A 14EZISOUEEl
Kd 999,60A 14EZISOUEEl cc-Feniii'arl
Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o
Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o "
Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o " 4,197'79
Kd 999,60A 14EZISOUEEl cc-Feniii'arl LA'o " 4,197'79 cc
999,60A 14EZISOUEEl
999,60A 14EZISOUEEl cc-Feniii'arl
999,60A 14EZISOUEEl cc-Feniii'arl LA'o
999,60A 14EZISOUEEl cc-Feniii'arl LA'o "
999,60A 14EZISOUEEl cc-Feniii'arl LA'o " 4,197'79
999,60A 14EZISOUEEl cc-Feniii'arl LA'o " 4,197'79 cc
999,60A 14EZISOUEEl cc-Feniii'arl LA'o " 4,197'79 cc sou-clnds.
10, 0 ; 10 = iltr#;Lt,t;,;ti i Karta:
10 ; 10 = iltr#;Lt,t;,;ti i Karta:
10 ; 10 = iltr#;Lt,t;,;ti i Karta: urro
; 10 = iltr#;Lt,t;,;ti i Karta:
; 10 = iltr#;Lt,t;,;ti i Karta: urro
; 10 = iltr#;Lt,t;,;ti i Karta: urro u'sa
10 = iltr#;Lt,t;,;ti i Karta:
10 = iltr#;Lt,t;,;ti i Karta: urro
10 = iltr#;Lt,t;,;ti i Karta: urro u'sa
10 = iltr#;Lt,t;,;ti i Karta: urro u'sa con
= iltr#;Lt,t;,;ti i Karta:
= iltr#;Lt,t;,;ti i Karta: urro
= iltr#;Lt,t;,;ti i Karta: urro u'sa
= iltr#;Lt,t;,;ti i Karta: urro u'sa con
= iltr#;Lt,t;,;ti i Karta: urro u'sa con iiibi-n006d6000s1010
iltr#;Lt,t;,;ti i Karta:
iltr#;Lt,t;,;ti i Karta: urro
iltr#;Lt,t;,;ti i Karta: urro u'sa
iltr#;Lt,t;,;ti i Karta: urro u'sa con
iltr#;Lt,t;,;ti i Karta: urro u'sa con iiibi-n006d6000s1010
iltr#;Lt,t;,;ti i Karta: urro u'sa con iiibi-n006d6000s1010 xxxx
i Karta:
i Karta: urro
i Karta: urro u'sa
i Karta: urro u'sa con
i Karta: urro u'sa con iiibi-n006d6000s1010
i Karta: urro u'sa con iiibi-n006d6000s1010 xxxx
i Karta: urro u'sa con iiibi-n006d6000s1010 xxxx xxxx,lxx;-r:8li
Karta: urro
Karta: urro u'sa
Karta: urro u'sa con
Karta: urro u'sa con iiibi-n006d6000s1010
Karta: urro u'sa con iiibi-n006d6000s1010 xxxx
Karta: urro u'sa con iiibi-n006d6000s1010 xxxx xxxx,lxx;-r:8li
Karta: urro u'sa con iiibi-n006d6000s1010 xxxx xxxx,lxx;-r:8li cz'
xxxx xxxx,lxx;-r:8li cz' sTaz,do Pt-odeJ ___ PIN oK
xxxx,lxx;-r:8li cz' sTaz,do Pt-odeJ ___ PIN oK
xxxx,lxx;-r:8li cz' sTaz,do Pt-odeJ ___ PIN oK ___
cz' sTaz,do Pt-odeJ ___ PIN oK
cz' sTaz,do Pt-odeJ ___ PIN oK ___
cz' sTaz,do Pt-odeJ ___ PIN oK ___ 59
sTaz,do Pt-odeJ ___ PIN oK
sTaz,do Pt-odeJ ___ PIN oK ___
sTaz,do Pt-odeJ ___ PIN oK ___ 59
sTaz,do Pt-odeJ ___ PIN oK ___ 59 llllt
Pt-odeJ ___ PIN oK
Pt-odeJ ___ PIN oK ___
Pt-odeJ ___ PIN oK ___ 59
Pt-odeJ ___ PIN oK ___ 59 llllt
Pt-odeJ ___ PIN oK ___ 59 llllt ill
___ PIN oK
___ PIN oK ___
___ PIN oK ___ 59
___ PIN oK ___ 59 llllt
___ PIN oK ___ 59 llllt ill
___ PIN oK ___ 59 llllt ill |llflfll
PIN oK
PIN oK ___
PIN oK ___ 59
PIN oK ___ 59 llllt
PIN oK ___ 59 llllt ill
PIN oK ___ 59 llllt ill |llflfll
PIN oK ___ 59 llllt ill |llflfll fllf
`)

export const receiptActualDebugExportFixtures: Record<'dm' | 'tesco', ReceiptActualDebugExportFixture> = {
    dm: {
        fileName: 'ScanDMPDF',
        sourceDocumentId: 'uploaded:receipt:1:scandmpdf',
        expectedTotalAmountMinor: 38870,
        expectedDisplayAmount: '388,70 CZK',
        expectedSupplierName: 'dm drogerie markt s.r.o.',
        normalizedLines: dmNormalizedLines,
        reconstructedReceiptLines: dmReconstructedReceiptLines
    },
    tesco: {
        fileName: 'ScanTesco.PDF',
        sourceDocumentId: 'uploaded:receipt:2:scantesco-pdf',
        expectedTotalAmountMinor: 378250,
        expectedDisplayAmount: '3 782,50 CZK',
        expectedSupplierName: 'TESCO Praha Eden',
        normalizedLines: tescoNormalizedLines,
        reconstructedReceiptLines: tescoReconstructedReceiptLines
    }
}
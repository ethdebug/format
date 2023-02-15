# Known challenges

The fundamental challenge for an Ethereum debugging data format is that, on the
one hand, we want it to be able to handle the complexity of Solidity and other
existing EVM languages; but also, we wish to handle these in a suitably general
manner rather than simply assuming this complexity, so that it may handle other
languages in the future; but also, we want to keep down the complexity of the
format itself if possible.

In what follows we'll outline some particular thorns of the EVM in general and
Solidity and Vyper in particular that will have to be addressed.  This is not
necessarily a complete list.

## Different data formats per location

Any debugging data format will need to handle the fact that in both Solidity and
in Vyper the same type can have different representations depending on which
location (the stack, memory, storage, calldata, or code) it is stored in.  As
such it does not suffice to give a single representation for a single type, but
rather, it may be necessary to specify multiple representations, corresponding
to the different data locations.

## The word-based nature of storage and the stack

Of the data locations mentioned above, most are byte-based, but two, the stack
and storage, are word-based.  This will likely necessitate slightly different
handling for them.

Moreover, the fact that these two locations are word-based means there can be a
need to specify endianness.  For instance, in Solidity, arrays may pack multiple
elements into the same storage word, starting from the low byte.  However,
segments of strings in storage start at the high byte of their word.  So it will
be necessary to have a way to specify this.  (In particular, consider the case
of a `bytes2[] storage`; each `bytes2` is packed into the word in a
little-endian order, but each `bytes2` itself is stord in a big-endian order.)

(Of course, there can also be a need to specify endianness in byte-based
locations, e.g. for storage of integers.  Currently all EVM languages known to
me do this in a big-endian fashion, because this is what the EVM makes
convenient.  It may be OK to assume that integers are big-endian, but the
reverse possibility is at least worth noting.)

## Complex stride patterns

In most languages, elements of an array are stored consecutively to one another.
However, this is not always the case, and so the DWARF debugging data format
allows one to distinguish between the lengths of the array elements and the
lengths of the array stride; this allows one to handle, say, the case of an
array whose elements are 2 bytes long but which each only begin on 8-byte
boundaries.

However, this simple notion of stride length is not sufficient for handling
Solidity's storage arrays, whose stride patterns can be more complex.  Solidity
allows for multiple elements in an array to be packed into a word, without
filling the whole word.  If we for a moment ignore the word-based nature of
storage and instead think of it as byte-based in a little-endian fashion,
Solidity allows for patterns like "15 bytes for one element, 15 bytes for the
next element, 2 bytes of empty space, repeat", which can't be expressed with a
simple stride length.

As such it may be necessary to provide a way to specify more complex stride
patterns (or packing patterns, as that's really what these are).

## The use of hash-based locations

Storage slots in both Solidity and Vyper are often assigned based on the Keccak
hash of various things; e.g., in a dynamically-sized array in Solidity, if the
length is stored at a slot `p`, the elements are stored beginning at
`keccak(p)`.

The format needs some way to be able to specify this.  This also raises the
question of whether we should allow for other hash functions.  Other hash
functions are unlikely to be used due to the EVM making keccak much more
convenient than other hashes, but it may not be the only possibility as there
are precompiles for both SHA-256 and RIPEMD-160.

## Solidity's two-case string storage

Solidity, when storing strings in storage, uses a two-case format, with one case
for if it's 31 bytes or shorter, and another case for 32 bytes or longer.

In order to handle this, it may be necessary to have a notion of union
representations, somewhat similar to the notion of union types?

## Mappings

Both Solidity and Vyper use mappings, and while these work similarly in both
languages, the two aren't the same.  It will necessary to handle both styles,
and ideally other potential styles as well.

In both languages, given a mapping at position `p` and a key `k`, the value
corresponding to `k` is stored at a location determined by the Keccak hash of a
combination of `p` and `k`.  But the details differ both by the language, and
whether we are looking at a value type that fits into a word, or whether we are
looking at a string or bytestring.

Solidity always performs the computation `keccak(k.p)`, where the `.` represents
concatenation.  However, for value types the key is padded to a full word, while
for a string or bytestring, no padding is used.

Vyper is similar, but differs in two ways.  For value types, the computation is
instead `keccak(p.k)`, with the concatenands in the other order; note that `k`
is still padded.  Meanwhile, for strings and bytestrings, the computation is
instead `keccak(p.keccak(k))` (again with no padding on `k`).  There will need
to be a way to specify this additional complexity.

## Markings for mapping keys

The problem of keeping track of mapping keys is worth discussing separately.

Mappings do not keep track of their keys; as such, it is up to the debugger to
keep track of mapping keys touched in a given transaction.  This will require
some kind of markings.

Truffle Debugger currently handles this by using the AST and determining what
value on the stack corresponds to the key specified for a given mapping access.
However, this process is complex and requires several workarounds for unusual
cases.  While presumably markings could be devised that allow this process to
work in more generality, it's not clear that it's actually a good solution.

An alternate approach, suggested some time ago by Nomic Labs, would be to have
markings applied to the SHA3 instructions that hash key/slot combinations.
However, in the case of Vyper, for strings and bytestrings, one would presumbly
also need to separately (and differently) mark the SHA3 instruction where the
string or bytestring is pre-hashed, prior to the main hashing.

## The use of pointers in or to calldata

In Solidity's ABI encoding format (used also by Vyper), which is necessarily
used for variables stored in calldata, pointers are relative.  However, they are
not relative to their own location, but rather relative to the start of the
structure containing them.  There will need to be some way to handle this.

Moreover, for types in Solidity with a variable number of elements (including
strings and bytestrings), pointers on the stack to that type in calldata do not
point to the beginning of the calldata representation (which would start with
the length), but rather have both a start word and a length word, with the start
word pointing just past where the length is stored (to the beginning of the
actual contents).  It will be necessary to handle this as well.

## Internal function pointers

Solidity includes internal function types, which have several associated
challenges.

Firstly, there are two different formats for these (depending on whether or not
`viaIR` was set in compilation), so it will be necessary to handle both.

Secondly, the format with `viaIR` turned on relies on assigning functions
arbitrary numeric indices, so the format will have to include information
mapping indices to functions.

Thirdly, in the format with `viaIR` turned off, an internal function pointer
actually breaks down into one PC value for the deployed code and one PC value
for the constructor code (although the latter is not always set and is sometimes
left as zero).  So there will need to be a way to specify this complexity.

Moreover, an internal function pointer can point to a designated revert function
introduced by the compiler rather than defined by the user; it will be necessary
to handle this case.

## Lack of fixed variable locations on the stack

In languages that put variables on the stack, those variables may not have a
fixed location.  (For instance, Solidity with optimization turned on.)  There
will need to be a way to keep track of variables that move around on the stack.

## The possibility of handling other languages

This is something of a reiteration of the initial point, but, it would be ideal
to be able to handle features that we may expect to see in other languages even
if they do not appear in Solidity or Vyper.

For instance, the (now-defunct) EVM language Pyramid was (largely) dynamically
typed, making each variable effectively a sum type.  Sum types are an example of
a feature we may want to be able to handle even if is not present in either
Solidity or Vyper.

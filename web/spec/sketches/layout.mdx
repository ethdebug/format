# Describing variable layout

## Status of this document
This is an initial draft for review and comment. It does not have consensus and should only be cited as work in progress.

## Goal of this document

To present the skeleton of a format for describing layout of complex types or variables of those types (in storage or elsewhere) that is:

1. Expressive enough to cover what Solidity and Vyper actually do,
2. Simple enough to be usable, and
3. Decently general, avoiding too much building in of Solidity and Vyper behaviors, and instead providing a way to specify those behaviors

Hopefully this approximately does that!  (Note that it may make assumptions based on the EVM, rather than Solidity and Vyper;
e.g., in our discussion of endianness, we'll say that we don't need to support little-endian numbers, because the EVM makes them
difficult; but note this is a property of the EVM, not any particular language.)

This is something of a skeleton.  One big problem that needs to be solved is to what extent this is applied to types vs to what
extend it's applied to individual variables.  For now this will basically assume it's applied to types.  Of course, it is also necessary
to describe the placement of individual variables, but hopefully with type layout information it's not necessary to individually describe
their layout.

So, for each type, we'll discuss what needs to specified to specify the type itself, and then what needs to be specified to specify how it's laid out
in each particular location.
Also, we'll discuss how to specify locations of individual variables.

What's written here might not be entirely compatible with what's in [format.md](./format.md).  That will need to be hammered out.

### Things this doesn't do

There's one big thing that this doesn't attempt, which is arrays that are directly multidimensional; more generally it doesn't cover
anything similar, like having arrays of structs where each struct takes up multiple words but they don't all start on word boundaries
but rather are packed in as if it was all just primitive types.  That seems to be too much complexity.

There's some other weird possibilities I didn't consider, like arrays that go downward in storage instead of upward.

## Specifying variable positions

Of course, the overall location itself will need to be specified, which (for now) can be memory, calldata, code, the stack, or storage.
(Coming soon: Transient storage?)  For each location, further information is then needed to specify the position within the location.

**Discussion**: Should position specifications include both start and end?  Notionally, end is redundant if layout is specified in the
type information.  I'll just discuss start here.  ("End" also potentially gets a bit messy when not everything runs the same way in
storage.)

**Discussion**: This document mentions "bytes" a lot.  Should many of these mentions be "bits"?  In many cases this would make no sense,
but in some cases, it could conceptually be possible.  The problem is that using bits instead of bytes is overall less convenient but
doesn't gain much generality.  But, it does gain us one important case (regarding how strings are stored in storage in Solidity),
so we need it at least there.  It seems inconsistent to use it only there and not more generally, though.  So likely we should more
often be using bits instead of bytes?  Something for later.

### Positions in memory, calldata, or code

These locations are byte-based, so here, positions can just be described as byte offsets.

### Positions on the stack

The stack is word-based.  So positions can be described as stack slots (counted from the bottom), plus a byte within the slot
(numbered from the little end?).   Now this last part may seem unnecessary, as who would put two different variables in the
same stack slot?  Well, see below regarding internal function pointers; I think we may need this.

### Positions in storage

Note: This presumably will apply also to transient storage, although implementation there is yet to be seen.

Sometimes multiple variables are packed into the same storage slot, so we need to specify both a storage slot and a byte within that slot (from the little end, probably).

This leaves the question of specifying a storage slot -- is it sufficient to just give the slot address, or do we need to show how it was constructed?  For
top-level variables, the slot address should be enough.  So if that's all we need, we don't need to say any more.  But I'll cover the other case just to be sure.

#### A note on endianness in storage

Above speaks of the "start", but what's the "start" in storage for, e.g., an integer packed into the middle of a word?  Is it the big end or the little end?

Assuming any particular endianness in storage seems bad (in Solidity e.g. it's different for arrays vs bytestrings), so each type should have a storage endianness
specified -- which does not need to agree with the endianness of its component types!  It covers only the outermost layer.
For something like an integer this is meaningless per se, but it is necessary to make sense of the "start" of that integer.

#### Specifying complex storage slots (if necessary)

A storage slot can be specified as one of the following objects:

`{ slotType: "raw", offset: bigint }`

`{ slotType: "offset", path: Slot, offset: bigint }`

`{ slotType: "hashedoffset", path: Slot, offset: bigint }`

```
{
slotType: "mapentry",
path: Slot,
mapType: "prefix" | "postfix" | "postfix-prehashed" | "prefix-prehashed"
key: <however we're representing bytestrings>
}
```

Here, prefix vs postfix means, does the key go before the map slot, or after?  "Prehashed" means we hash the key separately and then hash the *result*
together with the map slot (Vyper does this for certain types).  The possibility "prefix-prehashed" isn't currently used anywhere but may as well include
it form generality.

Ideally the key might be represented as some sort of decoded value, but that seems out of scope, so let's just record the raw bytes of it, I figure.

Possibly, for types that get padded before hashing, we could restrict the `key` field to be the bytes that actually represent the value, and
correspondingly increase the set of `mapType`s to also include information about how the value is padded.  Something to consider.  See the section
on specifying mappings for more discussion of this.

Question: Allow offset on map entry?  Don't really see a need for this.

## Specifying basic types

This might not need to be this complex.  The suggestions in [format.md](./format.md) suggest group all these together as just primitive types
with just `keyword`, `bitwidth`, and `alignment`.  Maybe that's better?  Although `alignment` should likely distinguish between zero-padding and sign-padding.

### Integers

Integers can be signed or unsigned and take up a specified number of bytes.  No need for anything exotic here.  We assume no integer type takes
up more than a single word.

`{ signed: boolean, bytes: number }`

#### Specifying layout

There are two things here that might need to be specified: endianness and padding.  Note that since we assume no integer type takes up more than a single word,
endianness is only a question for byte-based locations (memory, calldata, code).  It's not a meaningful question for storage or the stack, as these are word-based.  (However for storage layout
information there should still be an endianness specified, even though it's technically meaningless, so that sense can be made of which end is the "start".)

The EVM only really makes big-endian easy, so we probably don't need to specify endianness, and can just assume everything is big-endian.  If anyone ever does
little-endian for some reason, support for that can be added later.  For now though we can ignore the distinction between bytes that are earlier and bytes that
are more significant.

That leaves padding. We can specify this as follows:

`{ paddedBytes: number, paddingType: "zero" | "sign" | "right" }`

(Here `"zero"` means left-padded with zeroes, and `"right"` means right-padded with zeroes; `"sign"` means sign-padding.)

Likely there should be some simpler way to indicate when no padding is used (`{paddingType: "none"}`?), but this will do.

Note we don't include the bytewidth (or bitwidth) of the unpadded type, as that's in the type information rather than the layout information.  But obviously it needs to be specified somewhere.

### Fixed-point numbers

These work like integers, except we also need to specify a denominator.  Two possibilities:

1. Add a `bigint` `denominator` field
2. Add a `number` `base` field and a `number` `places` field

Either should work.

One could argue that we only need `places`, as only decimal fixed-point is implemented in any popular EVM language (Vyper), but binary fixed-point has
also been discussed in the past, and there's little cost to being general here.  If someone wants to do ternary fixed-point for some reason, sure, we can support that,
that isn't costly to include.

#### Specifying layout

Same as for integers.

### Short fixed-length bytestrings

"Short" meaning "fits in a word and is treated as a primitive type".  Probably this should be folded in with bytestrings more generally rather than treated
separately, see below about that, but this is listed here in case we want to treat it separately.

Not much to say here, just number of bytes.

#### Specifying layout

Same as above!

### Booleans

It's a boolean, nothing to say here.

#### Specifying layout

Same as above!

### Addresses and other primitive types?

Addresses are often treated as primitive?  The idea of not separating out primitive types is starting to sound like a better idea.  So maybe that's the thing to do, or maybe we can have the types above
and then just have a bucket for other primitives, such as addresses.

#### Specifying layout

Same as above!

#### A note on function pointers

What about function pointers?  Those are treated as a primitive type in Solidity!

Well, external function pointers decompose into two parts, an address and a selector.  So I think they should be treated as a complex type for our purposes here.
Internal function pointers also decompose into two parts in non-IR Solidity.

But, in IR Solidity, they don't decompose.  Also, in non-IR Solidity, what do they decompose into?  We might want some way to mark one of these miscellaneous primitive types
as an internal function pointer, so that whatever's reading this format can know to treat them as that.  (I don't see that we need this for external function pointers, since
each *part* of those is meaningful without this annotation.)

## Specifying more complex types

### Structs and similar inhomogeneous things

This can include things that may not necessarily be structs according to the language, but similarly contain a fixed number of parts and which aren't arrays.
So, for instance, as suggested above, external function pointers could be handled here, as well as internal function pointers in non-IR Solidity (of course then the two
components of that need to be handled some other way).

Anyway, obviously, you have to specify the component types and their order.

#### Specifying layout

For byte-based locations: Each component needs to have its starting offset specified, but that's not enough.  Each one also needs padding specified.
You can also specify an overall length for the whole thing, which is useful for in storage specifying that it should take up a whole number of words;
for storage this should be allowed in bytes or in words.

Also, each component needs to have specified how it's stored.  Based on how things are done in Solidity and Vyper, we can have several possibilities:
1. It's stored inline.  (This includes reference types in storage; they're not always "inline" per se
but they're inline for our purposes.)
2. It's stored as a pointer.  In this case we'll need to specify the length of the pointer.
3. It's stored as a relative pointer.  Now, in Solidity, when relative pointers are used, they're not relative to
the current location, they're relative to the start of the container they're inside.  We can allow for both possibilities,
probably (relative pointers aren't so exotic).  And of course we need to know the length of the pointer.

For the stack: Overall this is similar?  Structs don't live on the stack, but function pointers do.  It'll be necessary here
to use the ability to specify particular bytes within a stack slot.  Alternatively, if we don't want to allow that,
because we don't think splitting up internal function pointers is a good idea, we could allow separately specifying the padding
in each stack slot (this is necessary to handle Solidity's external function pointers, assuming we're handling them under this).

For storage: We *could* do something complicated, assuming that structs might get relocated in all sorts of weird ways,
but this is probably not a good idea to start with.  Instead we'll just assume that each struct either:
1. always start on a word boundary and so is always laid out internally in the same way, so we can give the
locations of the components relative to the start of the struct, or
2. is no more than a single word in length and never crosses word boundaries, in which case we can give positions
within the single word it's contained within (byte offsets relative to the start; endianness would have to be
marked to make these meaningful).

It'll probably be necessary to include an explicit tag to distinguish between these two cases.  Note the second
case is included to cover things that aren't actually structs but decompose into multiple parts.

### Tagged unions

These don't currently exist in Solidity or Vyper, but we should probably handle them?  Pyramid had them (in that
it was dynamically typed so everything was one).

For the type, we say what it's a union of.

#### Specifying layout

So, we have to specify where to find the tag, and what to do in each case.

For where to find the tag, we can give a start position and a length; note that for the reasons discussed below,
we may want to allow the tag to be have start and length given in individual *bits* rather than bytes.

For each option, then, we can give a layout specification and a start point.

### Union representations of non-union types

So, this is a bit funky, but what if we allowed union representations of non-union types?

That is, a type cound indicate that in a particular location, it had a tagged union representation;
as with tagged unions, it would be specified where to find the tag, and then there'd be an object for each case.
But the object would specify a layout, not a type!

This would allow handling Solidity storage strings.  The last bit of the word would be the tag.  In case 0,
bits 1-31 are the length, and bits 32-255 are the contents.  (So, we'd need to be able to specify individual
bits here, not just bytes.  Of course that's partly a concern for strings, not unions.)  In case 1, bits 1-255 are
the length, and we specify that the contents are at a hashed location.  (Note that if we use the ideas below,
we wouldn't actually specify the end of the contents, only the start.)

Of course, doing this means that all *ordinary* representations descriptions would need to have an additional
field to specify that they're not a union.  Or perhaps this information could go in a field outside the representation
description, to avoid that?

### Enumerations

Maybe these are treated like primitive types?  Maybe they're treated like tagged unions whose unioned types are all the unit type?  In that case we'd need to be able
to represent the unit type.

### Strings and bytestrings

Type information: Is it a string or a bytestring?  Is there a bound on its length?  Is the bound an exact length it must be (as has been proposed for Solidity), or is it a cap (as in Vyper)?

We probably don't need to bother with questions of string encodings, everything can be assumed to be UTF-8.  Possibly we could have a separate type for ASCII-only strings,
since some languages may want that as a separate type (Solidity has separate literals for with or without Unicode, though not separate types).
We probably don't need Latin-1 strings or anything like that.

#### Specifying layout

For numbers, endianness was potentially a concern for byte-based locations.  Here, it's not; instead it's potentially a concern for storage, since it's *not* byte-based.  Once again, though,
the EVM makes big-endian easy and little-endian hard, so we'll just assume big-endian and not include an endianness specification.

(On the other hand, Solidity does little-endian for arrays, so...?)

For ones of fixed (not merely bounded) length, there's not much to specify.  We're assuming big-endian, and the start is stored elsewhere.  We may want
to allow an offset in case the length is stored redundantly?  Also, for storage specifically, we do have to notate whether the
string is stored at the *actual* specified start, or at a hashed location.  So, `{ hashSlot: boolean }`.

For ones of variable length, we have more work to do, as we have to specify where to find both the length and the contents.

For storage, we can reasonably assume that strings have the two cases that structs do (possibly just the first but seems less clear we should assume that).
(Actually, if we don't assume that, possibly we could fold primitive bytestrings into the fixed-length case here as well.  There may be some situations that warrant
distinguishing, but that could likely be handled by explicitly tagging the different types as different types, not representing them differently
internally aside from the tag.)

So, we can specify where to find the length, the length of the length (or that can be determined by giving the length a type?), and the start of the contents.  For byte-based locations
that suffices.

However in storage, when we specify the offset, we also have to specify (for both the length and the contents separately!) whether the offset is relative
to the current slot or to the hash of the current slot.

You can also specify an overall length for the whole thing, which is useful for in storage specifying that it should take up a whole number of words;
for storage this should be allowed in bytes or in words.

Of course, Solidity famously does something more complicated with its strings, see union representation of non-union types for a possibility regarding handling that.

### Mappings

Have to specify key and value types, obviously.

Mappings are weird and specific enough that it makes sense to build-in a lot of the behavior rather than attempting to be very general.

#### Specifying layout

We'll just assume all mappings use something like Solidity or Vyper's system.  In this case, what needs to be specified for a given mapping is:

1. Does the key go before the slot, or after?
2. Is the key pre-hashed, like for strings in Vyper?
3. Is the key padded at all, and if so how?  I.e., to what width and with which padding type.  (Notionally this padding information could go in the key type itself, adding a "key" location for this purpose.  I am not assuming that
all locations get the same type of padding because this has not always been true in all versions of Solidity.)

Probably it is best to combine (1) and (2) into a `mapType` and keep (3) separate as a `paddingType`.

### Arrays

Note: This will exclude strings and bytestrings, handling them separately above, unlike [format.md](./format.md); another difference that will have to be figured out.

We can split these into fixed-length and variable length (whether bounded or unbounded).  And then you've got the base type.

#### Specifying layout

Oh boy, arrays.  This is where it truly gets messy if we want to be general.  Probably some generality will have to be
axed here for the sake of simplicity.

If the array is variable length, you need to specify the start of the length and of the contents;
for fixed-length, only the latter (it may not be at the start as the length may be stored redundantly).  You also need to specify the
length of the length, or perhaps that can be handled by giving the length a type.

In the case of storage, as is typical, this requires not only specifying an offset but also whether to hash the slot (this is separate
for the length and for the contents!).

Also, as with structs, you're going to have to specify whether the base type is stored inline, or whether it's a pointer, or whether it's
a relative pointer and of what sort.

You can once again also specify an overall length for the whole thing, which is useful for in storage specifying that it should take up a whole number of words;
for storage this should be allowed in bytes or in words.

What about paddingo of the elements?  Well, that's the messy part... the stride pattern.

See, we *could* just specify padding for the base type (what it's padded to and with what padding type).  But this wouldn't suffice to
handle the case of how Solidity does arrays in storage!  Maybe we can make this optional -- you can give a `paddedWith` and `paddingType`,
*or* you can use the more complicated stride pattern system.

Note that for storage you will also need to specify an endianness, since storage is word-based rather than byte-based.
Solidity does arrays little-endian!  So we really do need this to be specified here.  This could be specified for every
location for consistency, but that seems unnecessary.

Anyway, stride patterns.  Here's a simple proposal for how a stride pattern might be represented.

A stride pattern will be an array of objects, each of which is one of the following: `{ type: "element" }`, `{ type: "zero", length: number }`, or `{ type: "sign", length: number }`.

A stride pattern is interpreted as follows: `"element"` means an element goes here, of its appropriate length (no padding).  The `"zero"` type means this many bytes of zeroes.
And (this isn't currently necessary, but) `"sign"` will mean this many bytes of sign-padding, where the thing it's sign-padding is determined from context
(in big-endian contexts, it's the next thing; in little-endian contexts, the previous thing).  The stride pattern is implicitly periodic; the number of `"element"` entries is not
supposed to match that of the array, rather, when you get to the end of the stride pattern you go back to the start.

In a byte-based location, this means what it sounds like.  In storage, you have to read according to the endianness that was specified.  Note it's assumed that no element
that fits in a word will cross a word boundary, and that you won't use `"sign"` in places it doesn't make sense, that you won't have structs that are supposed to start
on a word boundary start elsewhere, etc.

In addition to the stride pattern, you can separately specify padding for the array as a whole (useful for making clear that it should take up a whole number of words).

Solidity examples:

* `uint256[]` -- it takes up the whole word, so the pattern is `[{ type: "element" }]`
* `uint128[]` -- there's two of them, so `[{ type: "element" }, { type: "element" }]`
* `uint96[]` -- there's two of them and then 64 bytes of padding, so `[{ type: "element" }, { type: "element" }, { type: "zero", length: 64 }]`
* `uint96[3][]` -- a `uint96[3]` takes up two full words always, so just `[{ type: "element" }]` suffices; what goes on inside the `uint96[3]` can be handled inside there
* `uint96[3]` -- the stride pattern is `[{ type: "element" }, { type: "element" }, { type: "zero", length: 64 }]` as above, but now we should *also* specify that the array as
                 a whole has an overall length of two words, so that in a `uint96[3][]`, there's no confusion about the fact that each one should start on a fresh word boundary.
                 (Not that it would be legal to start it anywhere else, but it should still be explciitly specified, not left as error-recovery behavior.)
 
#### Things probably not to include for now

Probably don't attempt to handle arrays that are directly multidimensional (as opposed to
multidimensional arrays just being ordinary arrays of arrays).  Allowing this also raises possibility
of a flag for row-major vs column-major order.  Probably best to just exclude this for now.

# BUG Language Examples

This directory contains example programs demonstrating various BUG language
features, organized by complexity.

## Directory Structure

```
examples/
  basic/           # Simple single-concept examples
  intermediate/    # Multiple concepts combined
  advanced/        # Complex real-world patterns
  optimizations/   # Compiler optimization demos
  wip/             # Work-in-progress (not yet compiling)
```

## Running Tests

All examples are automatically tested by the test suite:

```bash
yarn test examples
```

## Test Annotations

Examples can include special comments to control test behavior:

```bug
// @wip                    - Skip test (work in progress)
// @skip Reason            - Skip test with reason
// @expect-parse-error     - Expected to fail parsing
// @expect-typecheck-error - Expected to fail typechecking
// @expect-ir-error        - Expected to fail IR generation
// @expect-bytecode-error  - Expected to fail bytecode generation
```

## Examples by Category

### Basic

Simple examples demonstrating single language features:

- `minimal.bug` - Simplest possible BUG contract
- `conditionals.bug` - If/else statements
- `functions.bug` - Function definitions and calls
- `variables.bug` - Variable types and declarations
- `array-length.bug` - Array length property
- `constructor-init.bug` - Constructor initialization

### Intermediate

Examples combining multiple language features:

- `arrays.bug` - Array operations with loops
- `mappings.bug` - Mapping access patterns
- `scopes.bug` - Variable scoping and shadowing
- `slices.bug` - Byte slice operations
- `calldata.bug` - Calldata access via msg.data
- `owner-counter.bug` - Owner checks with counters
- `storage-arrays.bug` - Dynamic arrays in storage
- `memory-arrays.bug` - Memory array allocation
- `internal-functions.bug` - Internal function calls

### Advanced

Complex examples demonstrating real-world patterns:

- `nested-mappings.bug` - Mapping of mappings
- `nested-arrays.bug` - Multi-dimensional arrays
- `nested-structs.bug` - Nested struct storage
- `voting-system.bug` - Realistic voting contract
- `token-registry.bug` - Token with function selectors

### Optimizations

Examples showcasing compiler optimizations:

- `cse.bug` - Common subexpression elimination
- `cse-simple.bug` - Simple CSE example
- `constant-folding.bug` - Compile-time constant evaluation

### Work in Progress

Features not yet fully implemented:

- `transient-storage.bug` - TSTORE/TLOAD opcodes (no syntax)
- `returndata.bug` - Return data access

---

## Storage Access Patterns

The BUG language has specific rules about how storage variables can be
accessed and modified.

### Key Concept: Storage References vs Local Copies

In BUG, when you read a complex type (struct, array, or mapping) from storage
into a local variable, you get a **copy** of the data, not a reference. This
means:

- ✅ **Reading** from local copies works fine
- ❌ **Writing** to local copies does NOT update storage

### Correct Patterns

```bug
// Direct storage access - changes are persisted
accounts[user].balance = 1000;
votes[proposalId][0].amount = 100;
allowances[owner][spender] = 500;

// Reading into locals is fine
let currentBalance = accounts[user].balance;
let voteCount = votes[proposalId][0].amount;
```

### Incorrect Patterns

```bug
// ❌ WRONG: Changes to local copies don't persist
let userAccount = accounts[user];
userAccount.balance = 1000;  // This doesn't update storage!

// ❌ WRONG: Same issue with array elements
let firstVote = votes[proposalId][0];
firstVote.amount = 200;  // This doesn't update storage!
```

### Workaround

If you need to perform multiple operations on a storage struct, access each
field directly:

```bug
// Instead of:
let account = accounts[user];
account.balance = account.balance + 100;
account.isActive = true;

// Do this:
accounts[user].balance = accounts[user].balance + 100;
accounts[user].isActive = true;
```

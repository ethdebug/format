Search.setIndex({"docnames": ["index", "known-challenges", "overview", "schema"], "filenames": ["index.md", "known-challenges.md", "overview.md", "schema.md"], "titles": ["Ethereum Debugging Data Format", "Known challenges", "Overview", "Schema"], "terms": {"overview": 0, "summari": 0, "rational": 0, "goal": 0, "known": 0, "challeng": 0, "differ": 0, "per": 0, "locat": 0, "The": 0, "word": 0, "base": 0, "natur": 0, "storag": 0, "stack": 0, "complex": 0, "stride": 0, "pattern": [0, 3], "us": 0, "hash": 0, "solid": 0, "": 0, "two": 0, "case": 0, "string": [0, 3], "map": 0, "mark": 0, "kei": 0, "pointer": 0, "calldata": 0, "intern": 0, "function": 0, "lack": 0, "fix": 0, "variabl": 0, "possibl": 0, "handl": 0, "other": 0, "languag": 0, "schema": 0, "an": [0, 1], "exampl": [0, 1], "fundament": 1, "ethereum": 1, "debug": 1, "i": [1, 3], "one": 1, "hand": 1, "we": 1, "want": 1, "abl": 1, "exist": 1, "evm": 1, "also": 1, "wish": 1, "suitabl": 1, "gener": 1, "manner": 1, "rather": 1, "than": 1, "simpli": 1, "assum": 1, "thi": [1, 3], "so": 1, "mai": 1, "futur": 1, "keep": 1, "down": 1, "itself": 1, "In": 1, "what": 1, "follow": 1, "ll": 1, "outlin": 1, "some": 1, "particular": 1, "thorn": 1, "vyper": 1, "have": 1, "address": 1, "necessarili": 1, "complet": 1, "list": 1, "ani": 1, "need": 1, "fact": 1, "both": 1, "same": 1, "type": [1, 3], "can": 1, "represent": 1, "depend": 1, "which": 1, "memori": 1, "code": 1, "store": 1, "As": 1, "doe": 1, "suffic": 1, "give": 1, "singl": 1, "necessari": 1, "specifi": 1, "multipl": 1, "correspond": 1, "Of": 1, "mention": 1, "abov": 1, "most": 1, "ar": 1, "byte": 1, "like": 1, "necessit": 1, "slightli": 1, "them": 1, "moreov": 1, "mean": 1, "endian": 1, "For": 1, "instanc": 1, "arrai": 1, "pack": 1, "element": 1, "start": 1, "from": 1, "low": 1, "howev": 1, "segment": 1, "high": 1, "wai": 1, "consid": 1, "bytes2": 1, "each": 1, "littl": 1, "order": 1, "stord": 1, "big": 1, "cours": 1, "e": 1, "g": 1, "integ": 1, "current": 1, "all": 1, "me": 1, "do": 1, "fashion": 1, "becaus": 1, "make": 1, "conveni": 1, "It": 1, "ok": 1, "revers": 1, "least": 1, "worth": 1, "note": 1, "consecut": 1, "anoth": 1, "alwai": 1, "dwarf": 1, "allow": 1, "distinguish": 1, "between": 1, "length": 1, "sai": 1, "whose": 1, "2": 1, "long": 1, "onli": 1, "begin": 1, "8": 1, "boundari": 1, "simpl": 1, "notion": 1, "suffici": 1, "more": 1, "without": 1, "fill": 1, "whole": 1, "If": 1, "moment": 1, "ignor": 1, "instead": 1, "think": 1, "15": 1, "next": 1, "empti": 1, "space": 1, "repeat": 1, "t": 1, "express": 1, "provid": 1, "realli": 1, "slot": 1, "often": 1, "assign": 1, "keccak": 1, "variou": 1, "thing": 1, "dynam": 1, "size": 1, "p": 1, "rais": 1, "question": 1, "whether": 1, "should": 1, "unlik": 1, "due": 1, "much": 1, "precompil": 1, "sha": 1, "256": 1, "ripemd": 1, "160": 1, "when": 1, "31": 1, "shorter": 1, "32": 1, "longer": 1, "union": 1, "somewhat": 1, "similar": 1, "while": 1, "work": 1, "similarli": 1, "aren": 1, "style": 1, "ideal": 1, "potenti": 1, "well": 1, "given": 1, "posit": 1, "k": 1, "valu": 1, "determin": 1, "combin": 1, "But": 1, "detail": 1, "look": 1, "fit": 1, "bytestr": 1, "perform": 1, "comput": 1, "where": 1, "repres": 1, "concaten": 1, "pad": 1, "full": 1, "concatenand": 1, "still": 1, "meanwhil": 1, "again": 1, "There": 1, "addit": 1, "problem": 1, "track": 1, "discuss": 1, "separ": 1, "up": 1, "debugg": 1, "touch": 1, "transact": 1, "requir": 1, "kind": 1, "truffl": 1, "ast": 1, "access": 1, "process": 1, "sever": 1, "workaround": 1, "unusu": 1, "presum": 1, "could": 1, "devis": 1, "clear": 1, "actual": 1, "good": 1, "solut": 1, "altern": 1, "approach": 1, "suggest": 1, "time": 1, "ago": 1, "nomic": 1, "lab": 1, "would": 1, "appli": 1, "sha3": 1, "instruct": 1, "pre": 1, "prior": 1, "main": 1, "abi": 1, "encod": 1, "rel": 1, "thei": 1, "own": 1, "structur": 1, "contain": 1, "number": 1, "includ": 1, "point": 1, "just": [1, 3], "past": 1, "content": 1, "associ": 1, "firstli": 1, "viair": 1, "wa": 1, "set": 1, "compil": 1, "secondli": 1, "turn": 1, "reli": 1, "arbitrari": 1, "numer": 1, "indic": 1, "inform": 1, "thirdli": 1, "off": 1, "break": 1, "pc": 1, "deploi": 1, "constructor": 1, "although": 1, "latter": 1, "sometim": 1, "left": 1, "zero": 1, "design": 1, "revert": 1, "introduc": 1, "defin": 1, "user": 1, "put": 1, "those": 1, "optim": 1, "move": 1, "around": 1, "someth": 1, "reiter": 1, "initi": 1, "featur": 1, "expect": 1, "see": 1, "even": 1, "appear": 1, "now": 1, "defunct": 1, "pyramid": 1, "larg": 1, "effect": 1, "sum": 1, "present": 1, "either": 1, "project": 2, "http": 3, "com": 3, "json": 3, "tini": 3, "render": 3, "sphinx": 3, "jsonschema": 3, "object": 3, "properti": 3, "maxlength": 3, "100": 3, "minlength": 3, "10": 3, "A": 3, "z": 3}, "objects": {}, "objtypes": {}, "objnames": {}, "titleterms": {"ethereum": 0, "debug": 0, "data": [0, 1], "format": [0, 1], "content": 0, "known": 1, "challeng": 1, "differ": 1, "per": 1, "locat": 1, "The": 1, "word": 1, "base": 1, "natur": 1, "storag": 1, "stack": 1, "complex": 1, "stride": 1, "pattern": 1, "us": 1, "hash": 1, "solid": 1, "": 1, "two": 1, "case": 1, "string": 1, "map": 1, "mark": 1, "kei": 1, "pointer": 1, "calldata": 1, "intern": 1, "function": 1, "lack": 1, "fix": 1, "variabl": 1, "possibl": 1, "handl": 1, "other": 1, "languag": 1, "overview": 2, "summari": 2, "rational": 2, "goal": 2, "schema": 3, "an": 3, "exampl": 3}, "envversion": {"sphinx.domains.c": 2, "sphinx.domains.changeset": 1, "sphinx.domains.citation": 1, "sphinx.domains.cpp": 8, "sphinx.domains.index": 1, "sphinx.domains.javascript": 2, "sphinx.domains.math": 2, "sphinx.domains.python": 3, "sphinx.domains.rst": 2, "sphinx.domains.std": 2, "sphinx": 57}, "alltitles": {"Ethereum Debugging Data Format": [[0, "ethereum-debugging-data-format"]], "Contents": [[0, null]], "Known challenges": [[1, "known-challenges"]], "Different data formats per location": [[1, "different-data-formats-per-location"]], "The word-based nature of storage and the stack": [[1, "the-word-based-nature-of-storage-and-the-stack"]], "Complex stride patterns": [[1, "complex-stride-patterns"]], "The use of hash-based locations": [[1, "the-use-of-hash-based-locations"]], "Solidity\u2019s two-case string storage": [[1, "solidity-s-two-case-string-storage"]], "Mappings": [[1, "mappings"]], "Markings for mapping keys": [[1, "markings-for-mapping-keys"]], "The use of pointers in or to calldata": [[1, "the-use-of-pointers-in-or-to-calldata"]], "Internal function pointers": [[1, "internal-function-pointers"]], "Lack of fixed variable locations on the stack": [[1, "lack-of-fixed-variable-locations-on-the-stack"]], "The possibility of handling other languages": [[1, "the-possibility-of-handling-other-languages"]], "Overview": [[2, "overview"]], "Summary": [[2, "summary"]], "Rationale": [[2, "rationale"]], "Goals": [[2, "goals"]], "Schema": [[3, "schema"]], "An example": [[3, "an-example"]]}, "indexentries": {}})
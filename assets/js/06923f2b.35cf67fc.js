"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[1649],{37306:(e,n,s)=>{s.r(n),s.d(n,{assets:()=>c,contentTitle:()=>r,default:()=>h,frontMatter:()=>t,metadata:()=>a,toc:()=>l});var o=s(52322),i=s(45392);s(64223);const t={sidebar_position:2},r="Key concepts",a={id:"pointer/concepts",title:"Key concepts",description:"A pointer is a region or a collection of other pointers",source:"@site/spec/pointer/concepts.mdx",sourceDirName:"pointer",slug:"/pointer/concepts",permalink:"/format/spec/pointer/concepts",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/spec/pointer/concepts.mdx",tags:[],version:"current",sidebarPosition:2,frontMatter:{sidebar_position:2},sidebar:"docsSidebar",previous:{title:"Overview",permalink:"/format/spec/pointer/overview"},next:{title:"Schema",permalink:"/format/spec/pointer/"}},c={},l=[{value:"A <strong>pointer</strong> is a region or a collection of other pointers",id:"a-pointer-is-a-region-or-a-collection-of-other-pointers",level:2},{value:"A <strong>region</strong> is a single continuous range of byte addresses",id:"a-region-is-a-single-continuous-range-of-byte-addresses",level:2},{value:"A <strong>collection</strong> aggregates other pointers",id:"a-collection-aggregates-other-pointers",level:2},{value:"Pointers allow describing a value as a complex <strong>expression</strong>",id:"pointers-allow-describing-a-value-as-a-complex-expression",level:2},{value:"Collections can be dynamic",id:"collections-can-be-dynamic",level:2},{value:"A region is specified in terms of an <strong>addressing scheme</strong>",id:"a-region-is-specified-in-terms-of-an-addressing-scheme",level:2}];function d(e){const n={code:"code",h1:"h1",h2:"h2",p:"p",pre:"pre",strong:"strong",...(0,i.a)(),...e.components},{Details:s}=n;return s||function(e,n){throw new Error("Expected "+(n?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(n.h1,{id:"key-concepts",children:"Key concepts"}),"\n",(0,o.jsxs)(n.h2,{id:"a-pointer-is-a-region-or-a-collection-of-other-pointers",children:["A ",(0,o.jsx)(n.strong,{children:"pointer"})," is a region or a collection of other pointers"]}),"\n",(0,o.jsx)(n.p,{children:"High-level languages allow programmers to describe and manipulate conceptual\nideas as succinct, individual building blocks of machine execution.\nNowadays, thanks to decades of compiler research, resulting low-level machine\nstates are often reliably indecipherable, bearing no resemblance at all to\neven basic data abstractions."}),"\n",(0,o.jsxs)(n.p,{children:["The ",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer"})," schema provides a tree-based syntax for\nrepresenting complete (and often minutely detailed) address information for\nfinding a particular high-level data object. (For instance: a compiler may need\nto inform a debugger about where to find a particular array in memory.)\nAs such, this schema is specified recursively: a pointer is either a single,\ncontinuous sequence of bytes addresses (a ",(0,o.jsx)(n.strong,{children:"region"}),"), or it aggregates other\npointers (a ",(0,o.jsx)(n.strong,{children:"collection"}),")."]}),"\n",(0,o.jsxs)(n.h2,{id:"a-region-is-a-single-continuous-range-of-byte-addresses",children:["A ",(0,o.jsx)(n.strong,{children:"region"})," is a single continuous range of byte addresses"]}),"\n",(0,o.jsxs)(n.p,{children:["For simple allocations (like those that fit into a single word), the\n",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer"})," representation is also quite simple: just a single,\noptionally named, continuous chunk of bytes in the machine state."]}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Pointing to the first 32 bytes of memory"]})}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "name": "memory-start",\n  "location": "memory",\n  "offset": "0x0000000000000000000000000000000000000000000000000000000000000000",\n  "length": 32\n}\n'})})]}),"\n",(0,o.jsxs)(n.p,{children:["This schema defines the concept of a ",(0,o.jsx)(n.strong,{children:"region"})," to be the representation\nof the addressing details for a particular block of continuous bytes. Different\ndata locations use different, location-specific schemas for regions\n(since, e.g., stack regions are very different than storage regions). The\n",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer/region"})," schema aggregates these using the\n",(0,o.jsx)(n.code,{children:'"location"'})," field as a polymorphic discriminator."]}),"\n",(0,o.jsxs)(n.h2,{id:"a-collection-aggregates-other-pointers",children:["A ",(0,o.jsx)(n.strong,{children:"collection"})," aggregates other pointers"]}),"\n",(0,o.jsxs)(n.p,{children:["Other allocations are not so cleanly represented by a single continuous block\nof bytes anywhere. In these situations, the ",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer"}),"\nrepresentation can describe the aggregation of other composed pointers."]}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Solidity ",(0,o.jsx)(n.code,{children:"struct"})," in memory"]})}),(0,o.jsxs)(n.p,{children:["Consider the ",(0,o.jsx)(n.code,{children:"struct"})," definition:"]}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-solidity",children:"struct Record {\n    uint256 x;\n    uint256 y;\n}\n"})}),(0,o.jsxs)(n.p,{children:["A minimal way to represent one possible memory allocation for this type is\nto ",(0,o.jsx)(n.code,{children:'"group"'})," together two single-region pointers for each of the two struct\nmembers."]}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "group": [{\n    "location": "memory",\n    "offset": "0x40",\n    "length": 32\n  }, {\n    "location": "memory",\n    "offset": "0x60",\n    "length": 32\n  }]\n}\n'})})]}),"\n",(0,o.jsxs)(n.p,{children:["This kind of pointer is defined to be a ",(0,o.jsx)(n.strong,{children:"collection"})," of other pointers.\nThis schema includes several sub-schemas for different kinds of collections\n(e.g., since the allocation of struct types are very different from the\nallocation of array types, etc.). The ",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer/collection"}),"\nschema aggregates these."]}),"\n",(0,o.jsxs)(n.h2,{id:"pointers-allow-describing-a-value-as-a-complex-expression",children:["Pointers allow describing a value as a complex ",(0,o.jsx)(n.strong,{children:"expression"})]}),"\n",(0,o.jsxs)(n.p,{children:["The examples above all use literal values for ",(0,o.jsx)(n.code,{children:'"offset"'})," and ",(0,o.jsx)(n.code,{children:'"length"'}),", but\nthese will very often be impossible to predict at compile-time. This format\nprovides a JSON-based ",(0,o.jsx)(n.strong,{children:"expression"})," syntax for relating the data components\ninvolved in a complex allocation."]}),"\n",(0,o.jsx)(n.p,{children:"Besides representing byte offsets, word addresses, byte range lengths, etc.\nusing just unsigned integer literals, this schema also allows representing\naddressing details via numeric operations, references to named regions,\nexplicit EVM lookup, and so on.\nreference to other regions by name, and a few builtin operations."}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Region defined using an arithmetic operation"]})}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "location": "memory",\n  "offset": {\n    "$sum": [1, 1]\n  },\n  "length": 1\n}\n'})})]}),"\n",(0,o.jsxs)(n.p,{children:["More expressively, regions whose representations include a\n",(0,o.jsx)(n.code,{children:'"name": "<identifier>"'})," property allow the use of this ",(0,o.jsx)(n.code,{children:"<identifier>"})," in\nreferences to this region elsewhere in the pointer representation."]}),"\n",(0,o.jsx)(n.p,{children:"This can be used, for example, to indicate a storage slot whose address is\nknown at some point in execution to be the value at the top of the stack."}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Naming a region and reading this region's data from machine state"]})}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "group": [{\n    "name": "pointer-to-storage-slot",\n    "location": "stack",\n    "slot": 0\n  }, {\n    "name": "storage-slot",\n    "location": "storage",\n    "slot": {\n      "$read": "pointer-to-storage-slot"\n    }\n  }]\n}\n'})})]}),"\n",(0,o.jsxs)(n.p,{children:["Regions can also be referenced for the purposes of copying fields (to\navoid duplicating constants, etc.) This is useful, e.g., with structs, whose\nmembers often are allocated one after the next with no gap. In this example,\nthe sub-pointer corresponding to ",(0,o.jsx)(n.code,{children:"y"})," is positioned based on ",(0,o.jsx)(n.code,{children:"x"}),"'s offset\nand length."]}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Defining regions in terms of other regions"]})}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "group": [{\n    "name": "record-pointer",\n    "location": "stack",\n    "slot": 0\n  }, {\n    "name": "record-x",\n    "location": "memory",\n    "offset": {\n      "$read": "record-pointer"\n    },\n    "length": 32\n  }, {\n    "name": "record-y",\n    "location": "memory",\n    "offset": {\n      "$sum": [{ ".offset": "record-x" }, { ".length": "record-x" }]\n    },\n    "length": 32\n  }]\n}\n'})})]}),"\n",(0,o.jsx)(n.p,{children:"This schema is designed to allow compilers maximal expressiveness in producing\nself-contained representations that are completely knowable at compile-time."}),"\n",(0,o.jsx)(n.h2,{id:"collections-can-be-dynamic",children:"Collections can be dynamic"}),"\n",(0,o.jsxs)(n.p,{children:["For collections whose cardinality or configuration is unpredictable at\ncompile-time (e.g., ",(0,o.jsx)(n.code,{children:"uint256[]"})," or ",(0,o.jsx)(n.code,{children:"string storage"})," allocations, respectively),\nand for collections whose static representation would simply be too cumbersome\n(e.g., ",(0,o.jsx)(n.code,{children:"bytes32[3200][5600][111]"})," allocations),\n",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer/collection"})," provides sub-schemas for describing the\nfull set of inter-related data addresses in dynamic terms."]}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Representing a dynamically-sized array allocation"]})}),(0,o.jsx)(n.p,{children:"The following represents an allocation where the array's item count is stored\nas the leading word-sized sequence of bytes, and each item in the array has\nthe same fixed size and appears in memory sequentially following that with no\ngaps."}),(0,o.jsxs)(n.p,{children:["Notice how ",(0,o.jsx)(n.code,{children:'"list": { ... }'})," expects an object with an expression for the\nvalue of ",(0,o.jsx)(n.code,{children:'"count"'}),", the name of the scalar variable to represent ",(0,o.jsx)(n.code,{children:'"each"'}),"\nitem's index in the list, and the underlying pointer for the item itself."]}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "group": [\n    {\n      "name": "array-count",\n      "location": "memory",\n      "offset": "0x40",\n      "length": 32\n    },\n    {\n      "list": {\n        "count": { "$read": "array-count" },\n        "each": "item-index",\n        "is": {\n          "name": "array-item",\n          "location": "memory",\n          "offset": {\n            "$sum": [\n              { ".offset": "array-count" },\n              { ".length": "array-count" },\n              "$product": [\n                "item-index",\n                { ".length": "array-item" }\n              ]\n            ]\n          },\n          "length": 32\n        }\n      }\n    }\n  ]\n}\n'})})]}),"\n",(0,o.jsxs)(n.h2,{id:"a-region-is-specified-in-terms-of-an-addressing-scheme",children:["A region is specified in terms of an ",(0,o.jsx)(n.strong,{children:"addressing scheme"})]}),"\n",(0,o.jsx)(n.p,{children:"The EVM models its various data locations in a couple different ways based on\nhow bytes are defined to be arranged in each location: e.g., storage is\narranged in slots, but memory is just one long bytes array."}),"\n",(0,o.jsxs)(n.p,{children:["This pointer schema does not make any attempt to unify these different access\nabstractions, but instead it defines the concept of an ",(0,o.jsx)(n.strong,{children:"addressing scheme"}),"."]}),"\n",(0,o.jsx)(n.p,{children:"Each location-specific region schema is defined as an extension of the schema\nfor a particular addressing scheme."}),"\n",(0,o.jsxs)(n.p,{children:["This format currently defines two such addressing schemes:\n",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer/scheme/slice"})," and\n",(0,o.jsx)(n.strong,{children:"ethdebug/format/pointer/scheme/segment"}),", for addressing ranges within a\nsingle continuous byte array and addressing a slot or collection of slots\nin a word-arranged locaton (respectively)."]}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Slice-based region"]})}),(0,o.jsxs)(n.p,{children:["This example addresses the 32 bytes starting at location ",(0,o.jsx)(n.code,{children:"0x3334"})," in calldata:"]}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "location": "calldata",\n  "offset": "0x3334",\n  "length": "0x20"\n}\n'})})]}),"\n",(0,o.jsxs)(s,{children:[(0,o.jsx)("summary",{children:(0,o.jsxs)(n.p,{children:[(0,o.jsx)(n.strong,{children:"Example"}),": Segment-based region"]})}),(0,o.jsx)(n.p,{children:"This example addresses the first four slots of transient storage (beginning at\nslot 0)."}),(0,o.jsx)(n.pre,{children:(0,o.jsx)(n.code,{className:"language-json",children:'{\n  "location": "transient",\n  "slot": 0\n}\n'})})]})]})}function h(e={}){const{wrapper:n}={...(0,i.a)(),...e.components};return n?(0,o.jsx)(n,{...e,children:(0,o.jsx)(d,{...e})}):d(e)}}}]);
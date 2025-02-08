"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[1236],{25157:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>c,contentTitle:()=>s,default:()=>d,frontMatter:()=>r,metadata:()=>a,toc:()=>h});var i=n(52322),o=n(45392);const r={sidebar_position:2},s="Key concepts",a={id:"program/concepts",title:"Key concepts",description:"Programs are associated with a contract's compiled bytecode",source:"@site/spec/program/concepts.mdx",sourceDirName:"program",slug:"/program/concepts",permalink:"/format/spec/program/concepts",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/spec/program/concepts.mdx",tags:[],version:"current",sidebarPosition:2,frontMatter:{sidebar_position:2},sidebar:"docsSidebar",previous:{title:"Overview",permalink:"/format/spec/program/overview"},next:{title:"Example program",permalink:"/format/spec/program/example"}},c={},h=[{value:"Programs are associated with a contract&#39;s compiled bytecode",id:"programs-are-associated-with-a-contracts-compiled-bytecode",level:2},{value:"Programs contain instruction listings for debuggers to reference",id:"programs-contain-instruction-listings-for-debuggers-to-reference",level:2},{value:"Instructions describe high-level context details",id:"instructions-describe-high-level-context-details",level:2},{value:"Contexts inform high-level language semantics during machine tracing",id:"contexts-inform-high-level-language-semantics-during-machine-tracing",level:2}];function l(e){const t={code:"code",h1:"h1",h2:"h2",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...(0,o.a)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(t.h1,{id:"key-concepts",children:"Key concepts"}),"\n",(0,i.jsx)(t.h2,{id:"programs-are-associated-with-a-contracts-compiled-bytecode",children:"Programs are associated with a contract's compiled bytecode"}),"\n",(0,i.jsx)(t.p,{children:"This bytecode might either be the call bytecode, executed when a contract\naccount with this bytecode receives a message on-chain, or the create bytecode,\nexecuted as part of deploying the contract associated with the bytecode."}),"\n",(0,i.jsxs)(t.p,{children:["Reflecting this relationship, ",(0,i.jsx)(t.strong,{children:"ethdebug/format/program"})," records contain\na reference to the concrete contract (i.e., not an ",(0,i.jsx)(t.code,{children:"abstract contract"})," or\n",(0,i.jsx)(t.code,{children:"interface"}),"), the environment the bytecode will be executed (call or\ncreate), and the compilation that yielded the contract and bytecode."]}),"\n",(0,i.jsx)(t.h2,{id:"programs-contain-instruction-listings-for-debuggers-to-reference",children:"Programs contain instruction listings for debuggers to reference"}),"\n",(0,i.jsxs)(t.p,{children:["Programs contain a list of ",(0,i.jsx)(t.strong,{children:"ethdebug/format/program/instruction"})," objects,\nwhere each instruction corresponds to one machine instruction in the\nassociated bytecode."]}),"\n",(0,i.jsx)(t.p,{children:"These instructions are ordered sequentially, matching the order and\ncorresponding one-to-one with the encoded binary machine instructions in\nthe bytecode. Instructions specify the byte offset at which they appear in the\nbytecode; this offset is equivalent to program counter on non-EOF EVMs."}),"\n",(0,i.jsxs)(t.p,{children:["By indexing these instructions by their offset, ",(0,i.jsx)(t.strong,{children:"ethdebug/format"}),"\nprograms allow debuggers to lookup high-level information at any point\nduring machine execution."]}),"\n",(0,i.jsx)(t.h2,{id:"instructions-describe-high-level-context-details",children:"Instructions describe high-level context details"}),"\n",(0,i.jsxs)(t.p,{children:["Each instruction object in a program contains crucial information about the\nhigh-level language state at that point in the bytecode execution.\nInstructions represent these details using the\n",(0,i.jsx)(t.strong,{children:"ethdebug/format/program/context"})," schema, and these details may include:"]}),"\n",(0,i.jsxs)(t.ul,{children:["\n",(0,i.jsx)(t.li,{children:'Source code ranges associated with the instruction (i.e., "source mappings")'}),"\n",(0,i.jsx)(t.li,{children:"Variables known to be in scope following the instruction and where to\nfind those variable's values in the machine state"}),"\n",(0,i.jsx)(t.li,{children:"Control flow information such as an instruction being associated with the\nprocess of calling from one function to another"}),"\n"]}),"\n",(0,i.jsx)(t.p,{children:"This information serves as a compile-time guarantee about the high-level\nstate of the world that exists following each instruction."}),"\n",(0,i.jsx)(t.h2,{id:"contexts-inform-high-level-language-semantics-during-machine-tracing",children:"Contexts inform high-level language semantics during machine tracing"}),"\n",(0,i.jsx)(t.p,{children:"The context information provided for each instruction serves as a bridge\nbetween low-level EVM execution and high-level language constructs. Debuggers\ncan use these strong compile-time guarantees to piece together a useful and\nconsistent model of the high-level language code behind the running machine\nbinary."}),"\n",(0,i.jsx)(t.p,{children:"By following the state of machine execution, a debugger can use context\ninformation to stay apprised of the changing compile-time facts over the\ncourse of the trace. Each successively-encountered context serves as the\nsource of an observed state transition in the debugger's high-level state\nmodel. This allows the debugger to maintain an ever-changing and coherent\nview of the high-level language runtime."}),"\n",(0,i.jsx)(t.p,{children:"In essence, the information provided by objects in this schema serves as a\nmeans of reducing over state transitions, yielding a dynamic and accurate\nrepresentation of the program's high-level state. This enables debugging\ntools to:"}),"\n",(0,i.jsxs)(t.ol,{children:["\n",(0,i.jsx)(t.li,{children:"Map the current execution point back to the original source code"}),"\n",(0,i.jsx)(t.li,{children:"Reconstruct the state of variables at any given point"}),"\n",(0,i.jsx)(t.li,{children:"Provide meaningful stack traces that reference function names and source\nlocations"}),"\n",(0,i.jsx)(t.li,{children:"Offer insights into control flow, such as entering or exiting functions,\nor iterating through loops"}),"\n",(0,i.jsx)(t.li,{children:"Present data structures (like arrays or mappings) in a way that reflects\ntheir high-level representation, rather than their low-level storage"}),"\n"]}),"\n",(0,i.jsx)(t.p,{children:"By leveraging these contexts, debugging tools can offer a more intuitive and\ndeveloper-friendly experience when working with EVM bytecode, effectively\ntranslating between the machine-level execution and the high-level code that\ndevelopers write and understand. This continuous mapping between low-level\nexecution and high-level semantics allows developers to debug their smart\ncontracts more effectively, working with familiar concepts and structures\neven as they delve into the intricacies of EVM operation."})]})}function d(e={}){const{wrapper:t}={...(0,o.a)(),...e.components};return t?(0,i.jsx)(t,{...e,children:(0,i.jsx)(l,{...e})}):l(e)}}}]);
(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[95],{73488:(e,t,n)=>{"use strict";n.r(t),n.d(t,{assets:()=>h,contentTitle:()=>r,default:()=>u,frontMatter:()=>a,metadata:()=>c,toc:()=>d});var s=n(52322),i=n(45392),o=n(61376);const a={sidebar_position:4},r="Simulating a blockchain",c={id:"implementation-guides/pointers/testing/blockchain-simulation",title:"Simulating a blockchain",description:"In case you missed the",source:"@site/docs/implementation-guides/pointers/testing/blockchain-simulation.mdx",sourceDirName:"implementation-guides/pointers/testing",slug:"/implementation-guides/pointers/testing/blockchain-simulation",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/testing/blockchain-simulation",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/testing/blockchain-simulation.mdx",tags:[],version:"current",sidebarPosition:4,frontMatter:{sidebar_position:4},sidebar:"docsSidebar",previous:{title:"Invoking the compiler",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/testing/compilation"},next:{title:"Deploying contracts",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/testing/deployment"}},h={},d=[{value:"Implementing <code>machineForProvider()</code>",id:"implementing-machineforprovider",level:2},{value:"Requesting &quot;struct logs&quot;",id:"requesting-struct-logs",level:3},{value:"Converting to <code>Machine.State</code>",id:"converting-to-machinestate",level:3},{value:"Helper function: <code>constantUint()</code>",id:"helper-function-constantuint",level:4},{value:"Helper function: <code>makeStack()</code>",id:"helper-function-makestack",level:4},{value:"Helper function: <code>makeWords()</code>",id:"helper-function-makewords",level:4},{value:"Helper function: <code>makeBytes()</code>",id:"helper-function-makebytes",level:4},{value:"Note on loading Ganache",id:"note-on-loading-ganache",level:2}];function l(e){const t={a:"a",admonition:"admonition",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",p:"p",strong:"strong",...(0,i.a)(),...e.components};return(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(t.h1,{id:"simulating-a-blockchain",children:"Simulating a blockchain"}),"\n",(0,s.jsx)(t.admonition,{type:"warning",children:(0,s.jsxs)(t.p,{children:["In case you missed the\n",(0,s.jsx)(t.a,{href:"/docs/implementation-guides/pointers/testing/#ganache-warning",children:"note on this section's first page"}),",\nthe functionality described in this page uses the unmaintained\n",(0,s.jsx)(t.a,{href:"https://github.com/trufflesuite/ganache",children:"Ganache"})," software library for\nsimulating the EVM. See note for rationale and risk expectations."]})}),"\n",(0,s.jsxs)(t.p,{children:["This reference implemention relies heavily on the\n",(0,s.jsx)(t.a,{href:"/docs/implementation-guides/pointers/types/data-and-machines#machine",children:(0,s.jsx)(t.code,{children:"Machine"})}),"\ninterface it defines for reading the state of a running EVM; this page describes\nhow this implementation's integration tests adapt an\n",(0,s.jsx)(t.a,{href:"https://eips.ethereum.org/EIPS/eip-1193",children:"EIP-1193"})," JavaScript provider object\nto this interface."]}),"\n",(0,s.jsxs)(t.p,{children:["Since the primary purpose of ",(0,s.jsx)(t.code,{children:"Machine"})," is to represent a series of code\nexecution steps, the adapter described here simplifies the concept of an\nexecution trace by restricting it to mean that which happens within the course\nof an Ethereum transaction. The tests thus define a ",(0,s.jsx)(t.code,{children:"machineForProvider"}),"\nfunction to adapt a provider object for a particular transaction hash."]}),"\n",(0,s.jsxs)(t.p,{children:["As a result, this code only functions in the context of a provider to a\nblockchain whose JSON-RPC exposes the original\n",(0,s.jsx)(t.a,{href:"https://github.com/ethereum/go-ethereum",children:"go-ethereum"}),"'s\n",(0,s.jsx)(t.code,{children:'"debug_traceTransaction"'})," method, which exposes the state of the EVM at each\nstep of code execution for a particular transaction. Other kinds of traces (such\nas tracing the execution of an ",(0,s.jsx)(t.code,{children:'"eth_call"'})," request) are left to remain\nintentionally out-of-scope for the purposes of testing this implementation.\nOther implementations of the ",(0,s.jsx)(t.code,{children:"Machine"})," interface need not make this restriction."]}),"\n",(0,s.jsxs)(t.h2,{id:"implementing-machineforprovider",children:["Implementing ",(0,s.jsx)(t.code,{children:"machineForProvider()"})]}),"\n",(0,s.jsxs)(t.p,{children:["The ",(0,s.jsx)(t.code,{children:"machineForProvider()"})," function takes two arguments and returns an object\nadhering to the ",(0,s.jsx)(t.code,{children:"Machine"})," interface. See the code listing for this function:"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("machineForProvider")}),"\n",(0,s.jsxs)(t.p,{children:["This function is written to return an object whose ",(0,s.jsx)(t.code,{children:"trace()"})," method matches that\nwhich is defined by ",(0,s.jsx)(t.code,{children:"Machine"}),": a method to asynchronously produce an iterable\nlist of ",(0,s.jsx)(t.code,{children:"Machine.State"}),"s. This function leverages two other helper functions as\npart of the behavior of this method: ",(0,s.jsx)(t.code,{children:"requestStructLogs()"})," and\n",(0,s.jsx)(t.code,{children:"toMachineState()"}),"."]}),"\n",(0,s.jsx)(t.h3,{id:"requesting-struct-logs",children:'Requesting "struct logs"'}),"\n",(0,s.jsxs)(t.p,{children:["The Geth-style ",(0,s.jsx)(t.code,{children:'"debug_traceTransaction"'})," method returns a list of execution\nsteps and machine states inside the ",(0,s.jsx)(t.code,{children:'"structLogs"'})," field of the response's\nresult object."]}),"\n",(0,s.jsxs)(t.p,{children:["The asynchronous ",(0,s.jsx)(t.code,{children:"requestStructLogs"})," function is implemented as follows:"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("requestStructLogs")}),"\n",(0,s.jsxs)(t.p,{children:["Since Ganache does not have a publicly-documented or easily-accessible exported\ncollection of types, but since it ",(0,s.jsx)(t.strong,{children:"does"})," use string literal types to infer the\nspecific type of provider request being made, this code can use TypeScript's\ntype interference to ensure type safety in the adapter:"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getTypeAlias("StructLogs")}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getTypeAlias("StructLog")}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getTypeAlias("Depromise")}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getTypeAlias("Dearray")}),"\n",(0,s.jsxs)(t.p,{children:["These types are not exported by this module because they are internal to\n",(0,s.jsx)(t.code,{children:"machineForProvider()"})," concerns."]}),"\n",(0,s.jsxs)(t.h3,{id:"converting-to-machinestate",children:["Converting to ",(0,s.jsx)(t.code,{children:"Machine.State"})]}),"\n",(0,s.jsxs)(t.p,{children:["The ",(0,s.jsx)(t.code,{children:"toMachineState()"})," function is implemented by leveraging the use of the\n",(0,s.jsx)(t.a,{href:"/spec/pointer/concepts#a-region-is-specified-in-terms-of-an-addressing-scheme",children:"addressing schemes"}),"\ndefined by the ",(0,s.jsx)(t.strong,{children:"ethdebug/format/pointer"})," schema. Notice the use of the various\nhelper functions, listed below."]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("toMachineState")}),"\n",(0,s.jsxs)(t.h4,{id:"helper-function-constantuint",children:["Helper function: ",(0,s.jsx)(t.code,{children:"constantUint()"})]}),"\n",(0,s.jsxs)(t.p,{children:["Since the interface defined by ",(0,s.jsx)(t.code,{children:"Machine.State"})," is more asynchronous than likely\nnecessary (certainly it is more asynchronous than necessary for these testing\npurposes), many properties defined within ",(0,s.jsx)(t.code,{children:"Machine.State"})," must be converted from\na readily-available constant value into a ",(0,s.jsx)(t.code,{children:"Promise"})," that resolves to that value:"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("constantUint")}),"\n",(0,s.jsxs)(t.h4,{id:"helper-function-makestack",children:["Helper function: ",(0,s.jsx)(t.code,{children:"makeStack()"})]}),"\n",(0,s.jsxs)(t.p,{children:["Although the specification defines the ",(0,s.jsx)(t.code,{children:'"stack"'})," data location to use a regular\nsegment-based addressing scheme, this reference implementation distinguishes the\nstack from the other segment-based locations because of the use of numeric,\nunstable slot values."]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("makeStack")}),"\n",(0,s.jsxs)(t.h4,{id:"helper-function-makewords",children:["Helper function: ",(0,s.jsx)(t.code,{children:"makeWords()"})]}),"\n",(0,s.jsxs)(t.p,{children:["For other segment-based locations, the ",(0,s.jsx)(t.code,{children:"makeWords()"})," function is used:"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("makeWords")}),"\n",(0,s.jsxs)(t.h4,{id:"helper-function-makebytes",children:["Helper function: ",(0,s.jsx)(t.code,{children:"makeBytes()"})]}),"\n",(0,s.jsxs)(t.p,{children:["The ",(0,s.jsx)(t.code,{children:"makeBytes()"})," function is used for plain bytes-based data locations, such as\n",(0,s.jsx)(t.code,{children:'"memory"'}),":"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("makeBytes")}),"\n",(0,s.jsx)(t.h2,{id:"note-on-loading-ganache",children:"Note on loading Ganache"}),"\n",(0,s.jsxs)(t.p,{children:["To prevent Ganache's warnings from appearing in test console output, a custom\n",(0,s.jsx)(t.code,{children:"loadGanache()"})," function is defined to suppress known warnings while importing\nthe module:"]}),"\n",(0,s.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/ganache.ts",extract:e=>e.getFunction("loadGanache")})]})}function u(e={}){const{wrapper:t}={...(0,i.a)(),...e.components};return t?(0,s.jsx)(t,{...e,children:(0,s.jsx)(l,{...e})}):l(e)}},48313:e=>{function t(e){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=48313,e.exports=t},61376:(e,t,n)=>{"use strict";n.d(t,{Z:()=>m});var s=n(84560),i=n.n(s),o=n(20477),a=n(42408);var r=n(2784),c=n(27718),h=n(52322);function d(e){let{code:t,links:n,...s}=e;const o=(0,r.useRef)(null),[a,c]=(0,r.useState)(null);return(0,r.useEffect)((()=>{function e(){if(o.current){const e=o.current.querySelector("pre > code");if(e){const t=Array.from(e.childNodes).flatMap((e=>l(e,n)));c((0,h.jsx)("pre",{className:e.parentElement?.className,children:(0,h.jsx)("code",{className:e.className,children:t})}))}}}e();const t=new MutationObserver(e);return o.current&&t.observe(o.current,{childList:!0,subtree:!0}),()=>t.disconnect()}),[t,n]),a||(0,h.jsx)("div",{ref:o,children:(0,h.jsx)(i(),{...s,children:t})})}function l(e,t){return e.nodeType===Node.TEXT_NODE?function(e,t){const n=[];let s=e.textContent||"",i=0;for(const[o,a]of Object.entries(t)){let e=s.indexOf(o,i);for(;-1!==e;)e>i&&n.push(s.slice(i,e)),n.push((0,h.jsx)(c.Z,{to:a,className:"linked-code-block-link",children:o},`${o}-${e}`)),i=e+o.length,e=s.indexOf(o,i)}i<s.length&&n.push(s.slice(i));return n}(e,t):e.nodeType===Node.ELEMENT_NODE?function(e,t){const n=e.tagName.toLowerCase(),s={key:u++,className:e.className};e.style&&e.style.cssText&&(s.style=function(e){const t={};for(const n of e.split(";"))if(n){const[e,s]=n.split(":");if(e&&s){t[e.trim().replace(/-./g,(e=>e[1].toUpperCase()))]=s.trim()}}return t}(e.style.cssText));if(p.has(n))return r.createElement(n,s);const i=Array.from(e.childNodes).flatMap((e=>l(e,t)));return r.createElement(n,s,i)}(e,t):[]}let u=0;const p=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);function m(e){let{packageName:t,sourcePath:n,includePackageNameInTitle:s=!1,extract:r,links:c={},...l}=e;const u=function(e){const{packages:t}=(0,a.eZ)("project-code-plugin");if(!(e in t))throw new Error(`Unknown package name ${e}`);const{sourceFiles:n}=t[e],s=new o.IKL({useInMemoryFileSystem:!0});for(const{filePath:i,text:o}of n)s.createSourceFile(i,o,{overwrite:!0});return s}(t),p=u.getSourceFileOrThrow(n),m=r?r(p,u):p,g=m.getFullText().trim(),f=!r,x=s?(0,h.jsxs)(h.Fragment,{children:[(0,h.jsx)("strong",{children:t})," ",n]}):n;return Object.keys(c).length>0?(0,h.jsx)(d,{code:g,links:c,language:"typescript",...l}):(0,h.jsx)(i(),{language:"typescript",...f?{title:x,showLineNumbers:!0}:{showLineNumbers:!1},...l,children:m.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);
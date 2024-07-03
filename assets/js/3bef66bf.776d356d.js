(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[4963],{23349:(e,t,n)=>{"use strict";n.r(t),n.d(t,{assets:()=>l,contentTitle:()=>a,default:()=>u,frontMatter:()=>o,metadata:()=>c,toc:()=>p});var s=n(52322),r=n(45392),i=n(61376);const o={sidebar_position:2},a="Pointer types",c={id:"implementation-guides/pointers/types/pointer-types",title:"Pointer types",description:"Types and type guards for all kinds of pointers",source:"@site/docs/implementation-guides/pointers/types/pointer-types.mdx",sourceDirName:"implementation-guides/pointers/types",slug:"/implementation-guides/pointers/types/pointer-types",permalink:"/format/docs/implementation-guides/pointers/types/pointer-types",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/types/pointer-types.mdx",tags:[],version:"current",sidebarPosition:2,frontMatter:{sidebar_position:2},sidebar:"docsSidebar",previous:{title:"Essential type definitions",permalink:"/format/docs/implementation-guides/pointers/types/"},next:{title:"Data and machines",permalink:"/format/docs/implementation-guides/pointers/types/data-and-machines"}},l={},p=[{value:"Types and type guards for all kinds of pointers",id:"types-and-type-guards-for-all-kinds-of-pointers",level:2},{value:"Pointer.Expression",id:"pointerexpression",level:2},{value:"Code listing",id:"code-listing",level:2}];function d(e){const t={a:"a",code:"code",h1:"h1",h2:"h2",p:"p",pre:"pre",strong:"strong",...(0,r.a)(),...e.components};return(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(t.h1,{id:"pointer-types",children:"Pointer types"}),"\n",(0,s.jsx)(t.h2,{id:"types-and-type-guards-for-all-kinds-of-pointers",children:"Types and type guards for all kinds of pointers"}),"\n",(0,s.jsxs)(t.p,{children:["This package provides the root ",(0,s.jsx)(t.code,{children:"Pointer"})," type and accompanying ",(0,s.jsx)(t.code,{children:"Pointer"}),"\nnamespace, which contains TypeScript type definitions and type guards for\nworking with ",(0,s.jsx)(t.strong,{children:"ethdebug/format/pointer"})," objects."]}),"\n",(0,s.jsxs)(t.p,{children:["The ",(0,s.jsx)(t.code,{children:"Pointer"})," namespace is organized itself into namespaces in a nested manner,\nroughly to correspond to the JSON-Schema organization itself."]}),"\n",(0,s.jsx)(t.p,{children:"Types and type guards are available for all pointer schemas, i.e., for every\ndifferent kind of region and collection."}),"\n",(0,s.jsxs)(t.p,{children:["A ",(0,s.jsx)(t.a,{href:"#code-listing",children:"full source listing"})," follows below, but see example usage to\nget a sense for how these types are organized:"]}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-typescript",metastring:'title="Usage example"',children:'import { Pointer, isPointer } from "@ethdebug/pointers";\n\nconst region: Pointer.Region = { location: "stack", slot: 0 };\nconst group: Pointer.Collection.Group = { group: [region] };\n\nisPointer(region); // true\nPointer.isRegion(region); // true\nPointer.isRegion(group); // false\nPointer.isCollection(group); // true\nPointer.Collection.isGroup(group); // true\n'})}),"\n",(0,s.jsx)(t.h2,{id:"pointerexpression",children:"Pointer.Expression"}),"\n",(0,s.jsxs)(t.p,{children:["The ",(0,s.jsx)(t.code,{children:"Pointer"})," namespace also contains the ",(0,s.jsx)(t.code,{children:"Pointer.Expression"})," type and\naccompanying ",(0,s.jsx)(t.code,{children:"Pointer.Expression"})," namespace. This namespace is similarly\nnested, also roughly to correspond to the root JSON-Schema."]}),"\n",(0,s.jsx)(t.p,{children:"See these quick examples to get a sense for this part of the type hierarchy:"}),"\n",(0,s.jsx)(t.pre,{children:(0,s.jsx)(t.code,{className:"language-typescript",metastring:'title="Usage example"',children:'import { Pointer } from "@ethdebug/pointers";\n\nconst expression: Pointer.Expression = {\n  $sum: [0, 1]\n}\n\nPointer.Expression.isKeccak256(expression); // false\nPointer.Expression.isArithmetic(expression); // true\nPointer.Expression.Arithmetic.isSum(expression); // true\n'})}),"\n",(0,s.jsx)(t.h2,{id:"code-listing",children:"Code listing"}),"\n",(0,s.jsx)(i.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/pointer.ts"})]})}function u(e={}){const{wrapper:t}={...(0,r.a)(),...e.components};return t?(0,s.jsx)(t,{...e,children:(0,s.jsx)(d,{...e})}):d(e)}},48313:e=>{function t(e){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=48313,e.exports=t},61376:(e,t,n)=>{"use strict";n.d(t,{Z:()=>m});var s=n(84560),r=n.n(s),i=n(20477),o=n(42408);var a=n(2784),c=n(27718),l=n(52322);function p(e){let{code:t,links:n,...s}=e;const i=(0,a.useRef)(null),[o,c]=(0,a.useState)(null);return(0,a.useEffect)((()=>{function e(){if(i.current){const e=i.current.querySelector("pre > code");if(e){const t=Array.from(e.childNodes).flatMap((e=>d(e,n)));c((0,l.jsx)("pre",{className:e.parentElement?.className,children:(0,l.jsx)("code",{className:e.className,children:t})}))}}}e();const t=new MutationObserver(e);return i.current&&t.observe(i.current,{childList:!0,subtree:!0}),()=>t.disconnect()}),[t,n]),o||(0,l.jsx)("div",{ref:i,children:(0,l.jsx)(r(),{...s,children:t})})}function d(e,t){return e.nodeType===Node.TEXT_NODE?function(e,t){const n=[];let s=e.textContent||"",r=0;for(const[i,o]of Object.entries(t)){let e=s.indexOf(i,r);for(;-1!==e;)e>r&&n.push(s.slice(r,e)),n.push((0,l.jsx)(c.Z,{to:o,className:"linked-code-block-link",children:i},`${i}-${e}`)),r=e+i.length,e=s.indexOf(i,r)}r<s.length&&n.push(s.slice(r));return n}(e,t):e.nodeType===Node.ELEMENT_NODE?function(e,t){const n=e.tagName.toLowerCase(),s={key:u++,className:e.className};e.style&&e.style.cssText&&(s.style=function(e){const t={};for(const n of e.split(";"))if(n){const[e,s]=n.split(":");if(e&&s){t[e.trim().replace(/-./g,(e=>e[1].toUpperCase()))]=s.trim()}}return t}(e.style.cssText));if(h.has(n))return a.createElement(n,s);const r=Array.from(e.childNodes).flatMap((e=>d(e,t)));return a.createElement(n,s,r)}(e,t):[]}let u=0;const h=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);function m(e){let{packageName:t,sourcePath:n,extract:s,links:a={},...c}=e;const d=function(e){const{packages:t}=(0,o.eZ)("project-code-plugin");if(!(e in t))throw new Error(`Unknown package name ${e}`);const{sourceFiles:n}=t[e],s=new i.IKL({useInMemoryFileSystem:!0});for(const{filePath:r,text:i}of n)s.createSourceFile(r,i,{overwrite:!0});return s}(t),u=d.getSourceFileOrThrow(n),h=s?s(u,d):u,m=h.getFullText().trim(),g=!s;return Object.keys(a).length>0?(0,l.jsx)(p,{code:m,links:a,language:"typescript",...c}):(0,l.jsx)(r(),{language:"typescript",...g?{title:n,showLineNumbers:!0}:{showLineNumbers:!1},...c,children:h.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);
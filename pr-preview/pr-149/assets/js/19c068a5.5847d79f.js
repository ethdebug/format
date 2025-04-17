(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[3904],{71613:(e,t,n)=>{"use strict";n.r(t),n.d(t,{assets:()=>l,contentTitle:()=>c,default:()=>u,frontMatter:()=>o,metadata:()=>a,toc:()=>d});var r=n(52322),i=n(45392),s=n(61376);const o={sidebar_position:5,sidebar_label:"The dereference function"},c="The dereference() function",a={id:"implementation-guides/pointers/dereference-logic/dereference-logic",title:"The dereference() function",description:"Summary",source:"@site/docs/implementation-guides/pointers/dereference-logic/dereference-logic.mdx",sourceDirName:"implementation-guides/pointers/dereference-logic",slug:"/implementation-guides/pointers/dereference-logic/",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/dereference-logic/",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/dereference-logic/dereference-logic.mdx",tags:[],version:"current",sidebarPosition:5,frontMatter:{sidebar_position:5,sidebar_label:"The dereference function"},sidebar:"docsSidebar",previous:{title:"Evaluating pointer expressions",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/evaluating-expressions"},next:{title:"Generating regions on the fly",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/dereference-logic/generating-regions"}},l={},d=[{value:"Summary",id:"summary",level:2},{value:"<code>DereferenceOptions</code>",id:"dereferenceoptions",level:3},{value:"Control flow architecture",id:"control-flow-architecture",level:2}];function h(e){const t={a:"a",admonition:"admonition",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",li:"li",ol:"ol",p:"p",strong:"strong",...(0,i.a)(),...e.components},{Details:n}=t;return n||function(e,t){throw new Error("Expected "+(t?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)(t.h1,{id:"the-dereference-function",children:["The ",(0,r.jsx)(t.code,{children:"dereference()"})," function"]}),"\n",(0,r.jsx)(t.h2,{id:"summary",children:"Summary"}),"\n",(0,r.jsxs)(t.p,{children:["The pages in this section cover the internals of the ",(0,r.jsx)(t.code,{children:"dereference()"})," function\nin the ",(0,r.jsx)(t.strong,{children:"@ethdebug/pointers"})," reference implementation."]}),"\n",(0,r.jsx)(t.p,{children:"The full signature of this function is as follows:"}),"\n",(0,r.jsx)(s.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/dereference/index.ts",extract:(e,t)=>{const n=e.getFunction("dereference"),r=t.createSourceFile("dereference-summary.ts","",{overwrite:!0});for(const s of e.getImportDeclarations())r.addImportDeclaration(s.getStructure());const i=n.getLeadingCommentRanges().map((t=>e.getFullText().substring(t.getPos(),t.getEnd()))).join("\n");r.addFunction({name:n.getName(),parameters:n.getParameters().map(((e,t,n)=>({name:e.getName(),type:e.getType().getText(e),hasQuestionToken:e.hasQuestionToken()||e.hasInitializer(),leadingTrivia:"\n",trailingTrivia:t<n.length-1?void 0:"\n"}))),returnType:n.getReturnType().getText(n),hasDeclareKeyword:!0,isAsync:!0,leadingTrivia:`${i}\n`});return r.getFunction("dereference")}}),"\n",(0,r.jsx)(t.admonition,{type:"tip",children:(0,r.jsxs)(t.p,{children:["Remember from the\n",(0,r.jsx)(t.a,{href:"/docs/implementation-guides/pointers/types/cursors",children:"Cursors"})," section that a ",(0,r.jsx)(t.code,{children:"Cursor"}),"\nprovides a ",(0,r.jsx)(t.code,{children:"view(state: Machine.State)"})," method, which returns an ordered\ncollection of concrete ",(0,r.jsx)(t.code,{children:"Cursor.Region"})," objects."]})}),"\n",(0,r.jsx)(t.h3,{id:"dereferenceoptions",children:(0,r.jsx)(t.code,{children:"DereferenceOptions"})}),"\n",(0,r.jsxs)(t.p,{children:["Note the optional ",(0,r.jsx)(t.code,{children:"options: DereferenceOptions"})," argument. This argument\nallows for specifying additional information upfront that is necessary for\nviewing the cursor later. Currently, this is needed only for pointers that\ncompose stack-located regions."]}),"\n",(0,r.jsx)(s.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/dereference/index.ts",extract:e=>e.getInterface("DereferenceOptions")}),"\n",(0,r.jsx)(t.h2,{id:"control-flow-architecture",children:"Control flow architecture"}),"\n",(0,r.jsxs)(t.p,{children:["The ",(0,r.jsx)(t.code,{children:"dereference()"})," function itself performs two tasks:"]}),"\n",(0,r.jsxs)(t.ol,{children:["\n",(0,r.jsxs)(t.li,{children:['Create a "simple cursor": a function that takes a machine state and\nproduces an asynchronous list of ',(0,r.jsx)(t.code,{children:"Cursor.Region"}),"s."]}),"\n",(0,r.jsxs)(t.li,{children:["Adapt this simple cursor to conform to the full ",(0,r.jsx)(t.code,{children:"Cursor"})," interface"]}),"\n"]}),"\n",(0,r.jsxs)(t.p,{children:["Within the process of creating this simple cursor it gets more interesting:\nby leveraging JavaScript's\n",(0,r.jsx)(t.a,{href:"https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator",children:"AsyncIterator"}),"s,\nthe implementation can compute regions on the fly by recursively breaking down\npointers into their nested child pointers."]}),"\n",(0,r.jsxs)(t.p,{children:["Since the desired end-result of ",(0,r.jsx)(t.code,{children:"dereference()"})," is an object that can turn\na pointer into its composite ordered list of concrete regions at a particular\nmachine state, this implementation separates the concerns of generating this\nlist from converting this list into the promised return interface."]}),"\n",(0,r.jsxs)(t.p,{children:["To generate this list asynchronously on the fly, the implementation uses a\n",(0,r.jsx)(t.em,{children:"stack of processing requests"}),' (which it calls "memos"), initially populated\nwith a request to dereference the root pointer. Each memo represents a state\nor context change in some form: either a request to dereference a pointer or\nsub-pointer, a request to save a set of regions by their names, or a request\nto save the computed values of a set of variables by their identifiers.']}),"\n",(0,r.jsx)(t.p,{children:"The other pages in this section proceed to go into more detail."}),"\n",(0,r.jsxs)(n,{children:[(0,r.jsxs)("summary",{children:["See the full ",(0,r.jsx)(t.code,{children:"src/dereference/index.ts"})," module"]}),(0,r.jsx)(s.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/dereference/index.ts"})]})]})}function u(e={}){const{wrapper:t}={...(0,i.a)(),...e.components};return t?(0,r.jsx)(t,{...e,children:(0,r.jsx)(h,{...e})}):h(e)}},48313:e=>{function t(e){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=48313,e.exports=t},61376:(e,t,n)=>{"use strict";n.d(t,{Z:()=>m});var r=n(84560),i=n.n(r),s=n(20477),o=n(42408);var c=n(2784),a=n(27718),l=n(52322);function d(e){let{code:t,links:n,...r}=e;const s=(0,c.useRef)(null),[o,a]=(0,c.useState)(null);return(0,c.useEffect)((()=>{function e(){if(s.current){const e=s.current.querySelector("pre > code");if(e){const t=Array.from(e.childNodes).flatMap((e=>h(e,n)));a((0,l.jsx)("pre",{className:e.parentElement?.className,children:(0,l.jsx)("code",{className:e.className,children:t})}))}}}e();const t=new MutationObserver(e);return s.current&&t.observe(s.current,{childList:!0,subtree:!0}),()=>t.disconnect()}),[t,n]),o||(0,l.jsx)("div",{ref:s,children:(0,l.jsx)(i(),{...r,children:t})})}function h(e,t){return e.nodeType===Node.TEXT_NODE?function(e,t){const n=[];let r=e.textContent||"",i=0;for(const[s,o]of Object.entries(t)){let e=r.indexOf(s,i);for(;-1!==e;)e>i&&n.push(r.slice(i,e)),n.push((0,l.jsx)(a.Z,{to:o,className:"linked-code-block-link",children:s},`${s}-${e}`)),i=e+s.length,e=r.indexOf(s,i)}i<r.length&&n.push(r.slice(i));return n}(e,t):e.nodeType===Node.ELEMENT_NODE?function(e,t){const n=e.tagName.toLowerCase(),r={key:u++,className:e.className};e.style&&e.style.cssText&&(r.style=function(e){const t={};for(const n of e.split(";"))if(n){const[e,r]=n.split(":");if(e&&r){t[e.trim().replace(/-./g,(e=>e[1].toUpperCase()))]=r.trim()}}return t}(e.style.cssText));if(p.has(n))return c.createElement(n,r);const i=Array.from(e.childNodes).flatMap((e=>h(e,t)));return c.createElement(n,r,i)}(e,t):[]}let u=0;const p=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);function m(e){let{packageName:t,sourcePath:n,includePackageNameInTitle:r=!1,extract:c,links:a={},...h}=e;const u=function(e){const{packages:t}=(0,o.eZ)("project-code-plugin");if(!(e in t))throw new Error(`Unknown package name ${e}`);const{sourceFiles:n}=t[e],r=new s.IKL({useInMemoryFileSystem:!0});for(const{filePath:i,text:s}of n)r.createSourceFile(i,s,{overwrite:!0});return r}(t),p=u.getSourceFileOrThrow(n),m=c?c(p,u):p,f=m.getFullText().trim(),g=!c,x=r?(0,l.jsxs)(l.Fragment,{children:[(0,l.jsx)("strong",{children:t})," ",n]}):n;return Object.keys(a).length>0?(0,l.jsx)(d,{code:f,links:a,language:"typescript",...h}):(0,l.jsx)(i(),{language:"typescript",...g?{title:x,showLineNumbers:!0}:{showLineNumbers:!1},...h,children:m.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);
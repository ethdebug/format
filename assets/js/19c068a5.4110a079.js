(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[3904],{71613:(e,t,n)=>{"use strict";n.r(t),n.d(t,{assets:()=>d,contentTitle:()=>c,default:()=>u,frontMatter:()=>s,metadata:()=>a,toc:()=>l});var r=n(52322),i=n(45392),o=n(51114);const s={sidebar_position:5,sidebar_label:"The dereference function"},c="The dereference() function",a={id:"implementation-guides/pointers/dereference-logic/dereference-logic",title:"The dereference() function",description:"Summary",source:"@site/docs/implementation-guides/pointers/dereference-logic/dereference-logic.mdx",sourceDirName:"implementation-guides/pointers/dereference-logic",slug:"/implementation-guides/pointers/dereference-logic/",permalink:"/format/docs/implementation-guides/pointers/dereference-logic/",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/dereference-logic/dereference-logic.mdx",tags:[],version:"current",sidebarPosition:5,frontMatter:{sidebar_position:5,sidebar_label:"The dereference function"},sidebar:"docsSidebar",previous:{title:"Evaluating pointer expressions",permalink:"/format/docs/implementation-guides/pointers/evaluating-expressions"},next:{title:"Generating regions on the fly",permalink:"/format/docs/implementation-guides/pointers/dereference-logic/generating-regions"}},d={},l=[{value:"Summary",id:"summary",level:2},{value:"<code>DereferenceOptions</code>",id:"dereferenceoptions",level:3},{value:"Control flow architecture",id:"control-flow-architecture",level:2}];function h(e){const t={a:"a",admonition:"admonition",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",li:"li",ol:"ol",p:"p",strong:"strong",...(0,i.a)(),...e.components},{Details:n}=t;return n||function(e,t){throw new Error("Expected "+(t?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)(t.h1,{id:"the-dereference-function",children:["The ",(0,r.jsx)(t.code,{children:"dereference()"})," function"]}),"\n",(0,r.jsx)(t.h2,{id:"summary",children:"Summary"}),"\n",(0,r.jsxs)(t.p,{children:["The pages in this section cover the internals of the ",(0,r.jsx)(t.code,{children:"dereference()"})," function\nin the ",(0,r.jsx)(t.strong,{children:"@ethdebug/pointers"})," reference implementation."]}),"\n",(0,r.jsx)(t.p,{children:"The full signature of this function is as follows:"}),"\n",(0,r.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/dereference/index.ts",extract:(e,t)=>{const n=e.getFunction("dereference"),r=t.createSourceFile("dereference-summary.ts","",{overwrite:!0});for(const o of e.getImportDeclarations())r.addImportDeclaration(o.getStructure());const i=n.getLeadingCommentRanges().map((t=>e.getFullText().substring(t.getPos(),t.getEnd()))).join("\n");r.addFunction({name:n.getName(),parameters:n.getParameters().map(((e,t,n)=>({name:e.getName(),type:e.getType().getText(e),hasQuestionToken:e.hasQuestionToken()||e.hasInitializer(),leadingTrivia:"\n",trailingTrivia:t<n.length-1?void 0:"\n"}))),returnType:n.getReturnType().getText(n),hasDeclareKeyword:!0,isAsync:!0,leadingTrivia:`${i}\n`});return r.getFunction("dereference")}}),"\n",(0,r.jsx)(t.admonition,{type:"tip",children:(0,r.jsxs)(t.p,{children:["Remember from the\n",(0,r.jsx)(t.a,{href:"/docs/implementation-guides/pointers/types/cursors",children:"Cursors"})," section that a ",(0,r.jsx)(t.code,{children:"Cursor"}),"\nprovides a ",(0,r.jsx)(t.code,{children:"view(state: Machine.State)"})," method, which returns an ordered\ncollection of concrete ",(0,r.jsx)(t.code,{children:"Cursor.Region"})," objects."]})}),"\n",(0,r.jsx)(t.h3,{id:"dereferenceoptions",children:(0,r.jsx)(t.code,{children:"DereferenceOptions"})}),"\n",(0,r.jsxs)(t.p,{children:["Note the optional ",(0,r.jsx)(t.code,{children:"options: DereferenceOptions"})," argument. This argument\nallows for specifying additional information upfront that is necessary for\nviewing the cursor later. Currently, this is needed only for pointers that\ncompose stack-located regions."]}),"\n",(0,r.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/dereference/index.ts",extract:e=>e.getInterface("DereferenceOptions")}),"\n",(0,r.jsx)(t.h2,{id:"control-flow-architecture",children:"Control flow architecture"}),"\n",(0,r.jsxs)(t.p,{children:["The ",(0,r.jsx)(t.code,{children:"dereference()"})," function itself performs two tasks:"]}),"\n",(0,r.jsxs)(t.ol,{children:["\n",(0,r.jsxs)(t.li,{children:['Create a "simple cursor": a function that takes a machine state and\nproduces an asynchronous list of ',(0,r.jsx)(t.code,{children:"Cursor.Region"}),"s."]}),"\n",(0,r.jsxs)(t.li,{children:["Adapt this simple cursor to conform to the full ",(0,r.jsx)(t.code,{children:"Cursor"})," interface"]}),"\n"]}),"\n",(0,r.jsxs)(t.p,{children:["Within the process of creating this simple cursor it gets more interesting:\nby leveraging JavaScript's\n",(0,r.jsx)(t.a,{href:"https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator",children:"AsyncIterator"}),"s,\nthe implementation can compute regions on the fly by recursively breaking down\npointers into their nested child pointers."]}),"\n",(0,r.jsxs)(t.p,{children:["Since the desired end-result of ",(0,r.jsx)(t.code,{children:"dereference()"})," is an object that can turn\na pointer into its composite ordered list of concrete regions at a particular\nmachine state, this implementation separates the concerns of generating this\nlist from converting this list into the promised return interface."]}),"\n",(0,r.jsxs)(t.p,{children:["To generate this list asynchronously on the fly, the implementation uses a\n",(0,r.jsx)(t.em,{children:"stack of processing requests"}),' (which it calls "memos"), initially populated\nwith a request to dereference the root pointer. Each memo represents a state\nor context change in some form: either a request to dereference a pointer or\nsub-pointer, a request to save a set of regions by their names, or a request\nto save the computed values of a set of variables by their identifiers.']}),"\n",(0,r.jsx)(t.p,{children:"The other pages in this section proceed to go into more detail."}),"\n",(0,r.jsxs)(n,{children:[(0,r.jsxs)("summary",{children:["See the full ",(0,r.jsx)(t.code,{children:"src/dereference/index.ts"})," module"]}),(0,r.jsx)(o.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/dereference/index.ts"})]})]})}function u(e={}){const{wrapper:t}={...(0,i.a)(),...e.components};return t?(0,r.jsx)(t,{...e,children:(0,r.jsx)(h,{...e})}):h(e)}},48313:e=>{function t(e){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=48313,e.exports=t},51114:(e,t,n)=>{"use strict";n.d(t,{Z:()=>a});var r=n(84560),i=n.n(r),o=n(20477),s=n(42408);var c=n(52322);function a(e){let{packageName:t,sourcePath:n,extract:r,...a}=e;const d=function(e){const{packages:t}=(0,s.eZ)("project-code-plugin");if(!(e in t))throw new Error(`Unknown package name ${e}`);const{sourceFiles:n}=t[e],r=new o.IKL({useInMemoryFileSystem:!0});for(const{filePath:i,text:o}of n)r.createSourceFile(i,o,{overwrite:!0});return r}(t),l=d.getSourceFileOrThrow(n);if(!r)return(0,c.jsx)(i(),{title:n,language:"typescript",showLineNumbers:!0,children:l.getFullText()});const h=r(l,d);return(0,c.jsx)(i(),{language:"typescript",...a,children:h.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);
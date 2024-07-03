(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[2592],{6473:(e,n,t)=>{"use strict";t.r(n),t.d(n,{assets:()=>d,contentTitle:()=>o,default:()=>p,frontMatter:()=>r,metadata:()=>a,toc:()=>c});var i=t(52322),s=t(45392);t(84560),t(51114);const r={sidebar_position:1,sidebar_label:"Dereferencing pointers"},o="Dereferencing pointers",a={id:"implementation-guides/pointers/pointers",title:"Dereferencing pointers",description:"_An implementation guide for resolving ethdebug/format/pointers",source:"@site/docs/implementation-guides/pointers/pointers.mdx",sourceDirName:"implementation-guides/pointers",slug:"/implementation-guides/pointers/",permalink:"/format/docs/implementation-guides/pointers/",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/pointers.mdx",tags:[],version:"current",sidebarPosition:1,frontMatter:{sidebar_position:1,sidebar_label:"Dereferencing pointers"},sidebar:"docsSidebar",previous:{title:"Implementation guides",permalink:"/format/docs/implementation-guides/"},next:{title:"Essential type definitions",permalink:"/format/docs/implementation-guides/pointers/types/"}},d={},c=[{value:"Introduction",id:"introduction",level:2},{value:"How this guide is organized",id:"how-this-guide-is-organized",level:2}];function l(e){const n={a:"a",admonition:"admonition",em:"em",h1:"h1",h2:"h2",p:"p",strong:"strong",...(0,s.a)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(n.h1,{id:"dereferencing-pointers",children:"Dereferencing pointers"}),"\n",(0,i.jsx)(n.p,{children:(0,i.jsxs)(n.em,{children:["An implementation guide for resolving ",(0,i.jsx)(n.strong,{children:"ethdebug/format/pointer"}),"s\ninto concrete regions and values in a running EVM."]})}),"\n",(0,i.jsx)(n.h2,{id:"introduction",children:"Introduction"}),"\n",(0,i.jsxs)(n.p,{children:["This implementation guide describes the ",(0,i.jsx)(n.strong,{children:"@ethdebug/pointers"})," reference\nimplementation, written in TypeScript and intended for distribution as an\nNPM package."]}),"\n",(0,i.jsxs)(n.p,{children:["Debuggers looking to support ",(0,i.jsx)(n.strong,{children:"ethdebug/format"})," must be prepared to\ndereference the data allocations used by compilers for all kinds of variables.\nCompilers for EVM languages tend to use novel techniques for allocating data,\nand, as a result, compile-time descriptions of these allocations require an\nexpressive syntax."]}),"\n",(0,i.jsxs)(n.p,{children:["This format's ",(0,i.jsxs)(n.a,{href:"/spec/pointer/overview",children:[(0,i.jsx)(n.strong,{children:"ethdebug/format/pointer"})," schema"]}),"\nprovides such suitable expressiveness, but implementing the logic to read and\nevaluate data in this schema requires some careful consideration."]}),"\n",(0,i.jsxs)(n.admonition,{type:"tip",children:[(0,i.jsxs)(n.p,{children:["If you're reading this page without first having familiarized yourself with the\nconcepts/terminology defined by the ",(0,i.jsx)(n.strong,{children:"ethdebug/format/pointer"})," schema,\nit is recommended that you start by reading the\n",(0,i.jsx)(n.a,{href:"/spec/pointer/concepts",children:"Key concepts"})," page and then study the handful of\nexample pointers provided by ",(0,i.jsx)(n.a,{href:"/spec/pointer",children:"the schema itself"}),"."]}),(0,i.jsxs)(n.p,{children:["A fully-detailed understanding of the schema is not necessary for the purposes\nof understanding these docs, although if certain concepts are unclear, please\nraise the concern in a ",(0,i.jsx)(n.a,{href:"https://github.com/ethdebug/format/issues",children:"GitHub\nissue"}),"."]})]}),"\n",(0,i.jsx)(n.h2,{id:"how-this-guide-is-organized",children:"How this guide is organized"}),"\n",(0,i.jsxs)(n.p,{children:["These docs seek to provide a guide for implementing ",(0,i.jsx)(n.strong,{children:"ethdebug/format/pointer"}),"\nlogic by way of outlining and listing the code for an example implementation.\nThese pages are ordered so that more primitive components are introduced\nand described before the more complex components built upon them."]}),"\n",(0,i.jsxs)(n.p,{children:[(0,i.jsx)(n.strong,{children:"A suggestion to\nreaders who like to skip ahead"}),": you might want to read or skim the\n",(0,i.jsx)(n.a,{href:"/docs/implementation-guides/pointers/types",children:"Essential type definitions"})," pages\nto familiarize yourself with the nouns that this implementation employs."]})]})}function p(e={}){const{wrapper:n}={...(0,s.a)(),...e.components};return n?(0,i.jsx)(n,{...e,children:(0,i.jsx)(l,{...e})}):l(e)}},48313:e=>{function n(e){var n=new Error("Cannot find module '"+e+"'");throw n.code="MODULE_NOT_FOUND",n}n.keys=()=>[],n.resolve=n,n.id=48313,e.exports=n},51114:(e,n,t)=>{"use strict";t.d(n,{Z:()=>d});var i=t(84560),s=t.n(i),r=t(20477),o=t(42408);var a=t(52322);function d(e){let{packageName:n,sourcePath:t,extract:i,...d}=e;const c=function(e){const{packages:n}=(0,o.eZ)("project-code-plugin");if(!(e in n))throw new Error(`Unknown package name ${e}`);const{sourceFiles:t}=n[e],i=new r.IKL({useInMemoryFileSystem:!0});for(const{filePath:s,text:r}of t)i.createSourceFile(s,r,{overwrite:!0});return i}(n),l=c.getSourceFileOrThrow(t);if(!i)return(0,a.jsx)(s(),{title:t,language:"typescript",showLineNumbers:!0,children:l.getFullText()});const p=i(l,c);return(0,a.jsx)(s(),{language:"typescript",...d,children:p.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);
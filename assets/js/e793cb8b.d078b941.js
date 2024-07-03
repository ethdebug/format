"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[1600],{99904:(e,n,t)=>{t.r(n),t.d(n,{assets:()=>d,contentTitle:()=>o,default:()=>l,frontMatter:()=>a,metadata:()=>r,toc:()=>c});var i=t(52322),s=t(45392);const a={sidebar_position:6},o="End-to-end testing",r={id:"implementation-guides/pointers/testing/testing",title:"End-to-end testing",description:"Summary",source:"@site/docs/implementation-guides/pointers/testing/testing.mdx",sourceDirName:"implementation-guides/pointers/testing",slug:"/implementation-guides/pointers/testing/",permalink:"/format/docs/implementation-guides/pointers/testing/",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/testing/testing.mdx",tags:[],version:"current",sidebarPosition:6,frontMatter:{sidebar_position:6},sidebar:"docsSidebar",previous:{title:"Making regions concrete",permalink:"/format/docs/implementation-guides/pointers/dereference-logic/making-regions-concrete"},next:{title:"Finding example pointers",permalink:"/format/docs/implementation-guides/pointers/testing/example-pointers"}},d={},c=[{value:"Summary",id:"summary",level:2},{value:"Unmaintained dependencies warning",id:"ganache-warning",level:2}];function h(e){const n={a:"a",admonition:"admonition",code:"code",em:"em",h1:"h1",h2:"h2",p:"p",strong:"strong",...(0,s.a)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(n.h1,{id:"end-to-end-testing",children:"End-to-end testing"}),"\n",(0,i.jsx)(n.h2,{id:"summary",children:"Summary"}),"\n",(0,i.jsxs)(n.p,{children:["In addition to unit tests for each of the various modules, the\n",(0,i.jsx)(n.strong,{children:"@ethdebug/pointers"})," reference implementation includes automated integration\ntests that watch the changes to a ",(0,i.jsx)(n.code,{children:"dereference()"}),"d pointer over the course of\nthe execution of some Solidity code, ensuring that all expected values appear in\ntheir expected sequence."]}),"\n",(0,i.jsx)(n.p,{children:"These tests are defined to use a developer-friendly programmatic EVM and\nEthereum JSON-RPC simulator that models an Ethereum blockchain for purposes of\ntransactions and state inspection."}),"\n",(0,i.jsxs)(n.admonition,{type:"warning",children:[(0,i.jsxs)(n.p,{children:["These tests are implemented using\n",(0,i.jsx)(n.a,{href:"https://github.com/trufflesuite/ganache",children:"Ganache"}),", which has been unmaintained\nsince the end of 2023."]}),(0,i.jsxs)(n.p,{children:["See more details ",(0,i.jsx)(n.a,{href:"#ganache-warning",children:"below"}),"."]})]}),"\n",(0,i.jsx)(n.h2,{id:"ganache-warning",children:"Unmaintained dependencies warning"}),"\n",(0,i.jsxs)(n.p,{children:["The testing implementation described in this section uses the unmaintained\n",(0,i.jsx)(n.a,{href:"https://github.com/trufflesuite/ganache",children:"Ganache"}),", thus resulting in\n",(0,i.jsx)(n.strong,{children:"@ethdebug/pointers"})," having a developer dependency on this package. This\ndependency poses ",(0,i.jsx)(n.strong,{children:"no concern"})," for ",(0,i.jsx)(n.strong,{children:"@ethdebug/pointers"})," ",(0,i.jsx)(n.em,{children:"distributions"}),", but\nmay impact future developers who are looking to build/test this reference\nimplementation locally."]}),"\n",(0,i.jsxs)(n.p,{children:["At the time of implementation, Ganache was selected for use in these tests\nbecause it was uniquely suitable for use programmatically inside TypeScript.\nSadly, other options such as Hardhat's ",(0,i.jsx)(n.code,{children:"npx hardhat node"})," and Foundry's Anvil\nwould have required additional setup in the form of operating system process\nmanagement and complex adapter setup."]}),"\n",(0,i.jsx)(n.p,{children:"Due to Ganache's end-of-life timing, these tests are limited in that they cannot\ntest pointers to transient storage. Features from EVM versions before the Cancun\nhardfork should continue to work so long as there are no breaking changes\nintroduced by Node.js."})]})}function l(e={}){const{wrapper:n}={...(0,s.a)(),...e.components};return n?(0,i.jsx)(n,{...e,children:(0,i.jsx)(h,{...e})}):h(e)}}}]);
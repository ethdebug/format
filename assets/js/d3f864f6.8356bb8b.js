"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[2095],{98870:e=>{e.exports=JSON.parse('{"version":{"pluginId":"default","version":"current","label":"Next","banner":null,"badge":false,"noIndex":false,"className":"docs-version-current","isLast":true,"docsSidebars":{"docsSidebar":[{"type":"link","label":"Project overview","href":"/format/docs/overview","docId":"overview","unlisted":false},{"type":"link","label":"Known challenges","href":"/format/docs/known-challenges","docId":"known-challenges","unlisted":false},{"type":"category","label":"Prototype sketches","collapsible":true,"collapsed":true,"items":[{"type":"link","label":"@haltman-at\'s allocation data draft","href":"/format/docs/sketches/layout","docId":"sketches/layout","unlisted":false},{"type":"link","label":"@jtoman\'s format prototype","href":"/format/docs/sketches/prototype","docId":"sketches/prototype","unlisted":false}],"href":"/format/docs/category/prototype-sketches"},{"type":"category","label":"Implementation guides","collapsible":true,"collapsed":true,"items":[{"type":"category","label":"Dereferencing pointers","collapsible":true,"collapsed":true,"items":[{"type":"category","label":"Essential type definitions","collapsible":true,"collapsed":true,"items":[{"type":"link","label":"Pointer types","href":"/format/docs/implementation-guides/pointers/types/pointer-types","docId":"implementation-guides/pointers/types/pointer-types","unlisted":false},{"type":"link","label":"Data and machines","href":"/format/docs/implementation-guides/pointers/types/data-and-machines","docId":"implementation-guides/pointers/types/data-and-machines","unlisted":false},{"type":"link","label":"Cursor objects","href":"/format/docs/implementation-guides/pointers/types/cursors","docId":"implementation-guides/pointers/types/cursors","unlisted":false}],"href":"/format/docs/implementation-guides/pointers/types/"},{"type":"link","label":"Reading from pointer regions","href":"/format/docs/implementation-guides/pointers/reading-from-regions","docId":"implementation-guides/pointers/reading-from-regions","unlisted":false},{"type":"link","label":"Evaluating pointer expressions","href":"/format/docs/implementation-guides/pointers/evaluating-expressions","docId":"implementation-guides/pointers/evaluating-expressions","unlisted":false},{"type":"category","label":"The dereference function","collapsible":true,"collapsed":true,"items":[{"type":"link","label":"Generating regions on the fly","href":"/format/docs/implementation-guides/pointers/dereference-logic/generating-regions","docId":"implementation-guides/pointers/dereference-logic/generating-regions","unlisted":false},{"type":"link","label":"Making regions concrete","href":"/format/docs/implementation-guides/pointers/dereference-logic/making-regions-concrete","docId":"implementation-guides/pointers/dereference-logic/making-regions-concrete","unlisted":false}],"href":"/format/docs/implementation-guides/pointers/dereference-logic/"},{"type":"category","label":"End-to-end testing","collapsible":true,"collapsed":true,"items":[{"type":"link","label":"Finding example pointers","href":"/format/docs/implementation-guides/pointers/testing/example-pointers","docId":"implementation-guides/pointers/testing/example-pointers","unlisted":false},{"type":"link","label":"Invoking the compiler","href":"/format/docs/implementation-guides/pointers/testing/compilation","docId":"implementation-guides/pointers/testing/compilation","unlisted":false},{"type":"link","label":"Simulating a blockchain","href":"/format/docs/implementation-guides/pointers/testing/blockchain-simulation","docId":"implementation-guides/pointers/testing/blockchain-simulation","unlisted":false},{"type":"link","label":"Deploying contracts","href":"/format/docs/implementation-guides/pointers/testing/deployment","docId":"implementation-guides/pointers/testing/deployment","unlisted":false},{"type":"link","label":"Observing the machine","href":"/format/docs/implementation-guides/pointers/testing/machine-observation","docId":"implementation-guides/pointers/testing/machine-observation","unlisted":false},{"type":"category","label":"Test cases","collapsible":true,"collapsed":true,"items":[{"type":"link","label":"<struct> storage","href":"/format/docs/implementation-guides/pointers/testing/test-cases/struct-storage","docId":"implementation-guides/pointers/testing/test-cases/struct-storage","unlisted":false},{"type":"link","label":"string storage","href":"/format/docs/implementation-guides/pointers/testing/test-cases/string-storage","docId":"implementation-guides/pointers/testing/test-cases/string-storage","unlisted":false},{"type":"link","label":"uint256[] memory","href":"/format/docs/implementation-guides/pointers/testing/test-cases/uint256-array-memory","docId":"implementation-guides/pointers/testing/test-cases/uint256-array-memory","unlisted":false}],"href":"/format/docs/implementation-guides/pointers/testing/test-cases/"},{"type":"link","label":"Hooking up Jest","href":"/format/docs/implementation-guides/pointers/testing/jest","docId":"implementation-guides/pointers/testing/jest","unlisted":false}],"href":"/format/docs/implementation-guides/pointers/testing/"}],"href":"/format/docs/implementation-guides/pointers/"}],"href":"/format/docs/implementation-guides/"}]},"docs":{"implementation-guides/implementation-guides":{"id":"implementation-guides/implementation-guides","title":"Implementation guides","description":"This section of these docs serves to provide resources that guide readers who","sidebar":"docsSidebar"},"implementation-guides/pointers/dereference-logic/dereference-logic":{"id":"implementation-guides/pointers/dereference-logic/dereference-logic","title":"The dereference() function","description":"Summary","sidebar":"docsSidebar"},"implementation-guides/pointers/dereference-logic/generating-regions":{"id":"implementation-guides/pointers/dereference-logic/generating-regions","title":"Generating regions on the fly","description":"The dereference() function internally creates an","sidebar":"docsSidebar"},"implementation-guides/pointers/dereference-logic/making-regions-concrete":{"id":"implementation-guides/pointers/dereference-logic/making-regions-concrete","title":"Making regions concrete","description":"There are two main aspects involved when converting from a Pointer.Region,","sidebar":"docsSidebar"},"implementation-guides/pointers/evaluating-expressions":{"id":"implementation-guides/pointers/evaluating-expressions","title":"Evaluating pointer expressions","description":"Expression evaluation is a bit more interesting than reading raw region data,","sidebar":"docsSidebar"},"implementation-guides/pointers/pointers":{"id":"implementation-guides/pointers/pointers","title":"Dereferencing pointers","description":"_An implementation guide for resolving ethdebug/format/pointers","sidebar":"docsSidebar"},"implementation-guides/pointers/reading-from-regions":{"id":"implementation-guides/pointers/reading-from-regions","title":"Reading from pointer regions","description":"Being able to read a particular pointer region\'s data from a machine state","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/blockchain-simulation":{"id":"implementation-guides/pointers/testing/blockchain-simulation","title":"Simulating a blockchain","description":"In case you missed the","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/compilation":{"id":"implementation-guides/pointers/testing/compilation","title":"Invoking the compiler","description":"In being able to test a pointer dereference implementation, it is necessary to","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/deployment":{"id":"implementation-guides/pointers/testing/deployment","title":"Deploying contracts","description":"Deploying a contract with some EVM bytecode is straightforward with","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/example-pointers":{"id":"implementation-guides/pointers/testing/example-pointers","title":"Finding example pointers","description":"These integration tests seek to minimize the use of bespoke data whose","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/jest":{"id":"implementation-guides/pointers/testing/jest","title":"Hooking up Jest","description":"Putting all the pieces together, the following code listing shows the top-level","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/machine-observation":{"id":"implementation-guides/pointers/testing/machine-observation","title":"Observing the machine","description":"These integration tests leverage the observeTrace() helper function to","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/test-cases/string-storage":{"id":"implementation-guides/pointers/testing/test-cases/string-storage","title":"Test case: string storage","description":"Representing a Solidity string storage using an ethdebug/format/pointer","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/test-cases/struct-storage":{"id":"implementation-guides/pointers/testing/test-cases/struct-storage","title":"Test case: <struct> storage","description":"Solidity tightly packs struct storage words starting from the right-hand side.","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/test-cases/test-cases":{"id":"implementation-guides/pointers/testing/test-cases/test-cases","title":"Test cases","description":"This reference implementation currently defines the following integration test","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/test-cases/uint256-array-memory":{"id":"implementation-guides/pointers/testing/test-cases/uint256-array-memory","title":"Test case: uint256[] memory","description":"Memory arrays are primarily referenced using stack-located memory offset values,","sidebar":"docsSidebar"},"implementation-guides/pointers/testing/testing":{"id":"implementation-guides/pointers/testing/testing","title":"End-to-end testing","description":"Summary","sidebar":"docsSidebar"},"implementation-guides/pointers/types/cursors":{"id":"implementation-guides/pointers/types/cursors","title":"Cursor objects","description":"The core functionality that @ethdebug/pointers provides is the","sidebar":"docsSidebar"},"implementation-guides/pointers/types/data-and-machines":{"id":"implementation-guides/pointers/types/data-and-machines","title":"Data and machines","description":"The @ethdebug/pointers package includes two abstractions that it uses for","sidebar":"docsSidebar"},"implementation-guides/pointers/types/pointer-types":{"id":"implementation-guides/pointers/types/pointer-types","title":"Pointer types","description":"Types and type guards for all kinds of pointers","sidebar":"docsSidebar"},"implementation-guides/pointers/types/types":{"id":"implementation-guides/pointers/types/types","title":"Essential type definitions","description":"This reference implementation uses a few fundamental types/interfaces for","sidebar":"docsSidebar"},"known-challenges":{"id":"known-challenges","title":"Known challenges","description":"The fundamental challenge for an Ethereum debugging data format is that, on the","sidebar":"docsSidebar"},"overview":{"id":"overview","title":"Project overview","description":"Summary, rationale, and project goals","sidebar":"docsSidebar"},"sketches/layout":{"id":"sketches/layout","title":"@haltman-at\'s allocation data draft","description":"Initial format sketch","sidebar":"docsSidebar"},"sketches/prototype":{"id":"sketches/prototype","title":"@jtoman\'s format prototype","description":"Initial format sketch","sidebar":"docsSidebar"}}}}')}}]);
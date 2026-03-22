# @ethdebug/bug-playground

A web-based playground for the BUG language, built with React, TypeScript, and Vite.

## Features

- **Monaco Editor**: Full-featured code editor with BUG syntax highlighting
- **Live Compilation**: See AST, IR (optimized and unoptimized), and bytecode output
- **Optimization Levels**: Choose from 4 optimization levels (0-3)
- **Example Programs**: Automatically loaded from the `examples/` directory
- **Error Highlighting**: Clear error messages and warnings from the compiler

## Development

Install dependencies:

```bash
yarn install
```

Start the development server:

```bash
yarn dev
```

Build for production:

```bash
yarn build
```

## Scripts

- `yarn start` - Start development server
- `yarn build` - Build for production
- `yarn preview` - Preview production build
- `yarn typecheck` - Run TypeScript type checking
- `yarn lint` - Run ESLint

## Architecture

The playground is organized by domain/logical concerns:

- `playground/` - Main playground UI and example programs
- `editor/` - Monaco editor integration and BUG language definition
- `compiler/` - Compiler integration and output visualization
- `visualization/` - AST, IR, and bytecode visualizations

## Technologies

- React 18
- TypeScript 5
- Vite 5
- Monaco Editor
- @ethdebug/bugc (BUG Compiler)

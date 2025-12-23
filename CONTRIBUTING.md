# Contributing to FlacronAI

First off, thank you for considering contributing to FlacronAI! It's people like you that make FlacronAI such a great tool for insurance professionals.

## 🎯 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title** and **description**
- **Steps to reproduce** the behavior
- **Expected behavior**
- **Screenshots** if applicable
- **Environment details** (OS, Node version, browser, etc.)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:

- **Clear use case** - Why is this enhancement useful?
- **Proposed solution** - How should it work?
- **Alternative solutions** - What other approaches did you consider?

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code, add tests
3. Ensure the test suite passes
4. Make sure your code lints
5. Issue the pull request!

## 🛠️ Development Process

### Setup Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/FlacronAI.git
cd FlacronAI

# Add upstream remote
git remote add upstream https://github.com/RODRIGUEFOKA/FlacronAI.git

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Install mobile dependencies
cd ../MobileApp && npm install
```

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our code style guidelines

3. Test your changes:
   ```bash
   # Backend tests
   cd backend && npm test

   # Frontend tests
   cd frontend && npm test
   ```

4. Commit your changes:
   ```bash
   git commit -m "feat: add amazing feature"
   ```

   Use conventional commits:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request on GitHub

## 📝 Code Style Guidelines

### JavaScript/React

- Use ES6+ features (const/let, arrow functions, async/await)
- Use functional components with Hooks (no class components)
- Use camelCase for variables and functions
- Use PascalCase for React components
- Add JSDoc comments for functions
- Keep functions small and focused (single responsibility)

```javascript
/**
 * Generate insurance report using AI
 * @param {Object} reportData - Report details
 * @returns {Promise<Object>} Generated report
 */
async function generateReport(reportData) {
  // Implementation
}
```

### File Organization

- One component per file
- Co-locate related files (components, styles, tests)
- Use descriptive file names
- Group by feature, not by type

### Git Commit Messages

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit first line to 72 characters
- Reference issues and pull requests

## 🧪 Testing Guidelines

- Write tests for new features
- Maintain or increase code coverage
- Test edge cases and error handling
- Use descriptive test names

```javascript
describe('generateReport', () => {
  it('should generate report with valid data', async () => {
    // Test implementation
  });

  it('should throw error with invalid data', async () => {
    // Test implementation
  });
});
```

## 📚 Documentation

- Update README.md if you change functionality
- Add JSDoc comments for public APIs
- Update TECHNICAL_DOCUMENTATION.md for architectural changes
- Include setup instructions for new dependencies

## 🔒 Security

- Never commit API keys, passwords, or sensitive data
- Use environment variables for configuration
- Report security vulnerabilities privately to the maintainers
- Follow OWASP security best practices

## 🚀 Deployment Guidelines

- Test locally before pushing
- Ensure builds complete without errors
- Update version numbers following semver
- Tag releases appropriately

## 💬 Community

- Be respectful and inclusive
- Provide constructive feedback
- Help others when you can
- Follow the Code of Conduct

## 📋 Pull Request Process

1. Update documentation with details of changes
2. Update the README.md with new environment variables, dependencies, etc.
3. The PR will be merged once you have approval from maintainers

## ❓ Questions?

Feel free to open an issue labeled "question" or reach out to the maintainers.

---

Thank you for contributing to FlacronAI! 🎉

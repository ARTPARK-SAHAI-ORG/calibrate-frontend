Make changes to the codebase while maintaining context.

1. **FIRST**: Read `.cursor/rules/app-details.md` to understand current state
2. Search the codebase for relevant code based on the user's request
3. Make the requested changes following existing patterns
4. After changes, update `.cursor/rules/app-details.md` with:
   - What you changed and why
   - New patterns or components introduced
   - Updated relationships between components
   - Any gotchas or edge cases discovered
5. Keep the context file concise but informative. Don't maintain it as a changelog. Instead, look for what was already present but has become obsolete now. Remove or update it as necessary. Look for what is missing and add it.

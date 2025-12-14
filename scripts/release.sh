#!/bin/bash

# ============================================================================
# @struktos/prisma Release Script
# ============================================================================
#
# Usage:
#   ./scripts/release.sh          # Release current version
#   ./scripts/release.sh patch    # Bump patch version (0.1.0 -> 0.1.1)
#   ./scripts/release.sh minor    # Bump minor version (0.1.0 -> 0.2.0)
#   ./scripts/release.sh major    # Bump major version (0.1.0 -> 1.0.0)
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           @struktos/cli Release Script                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ============================================================================
# Pre-flight Checks
# ============================================================================

echo -e "${BLUE}🔍 Running pre-flight checks...${NC}\n"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}❌ Not a git repository${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Git repository"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    git status --short
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} No uncommitted changes"
fi

# Check if on main/master branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
    echo -e "${YELLOW}⚠️  Warning: Not on main/master branch (current: $CURRENT_BRANCH)${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} On $CURRENT_BRANCH branch"
fi

# Check npm login
if ! npm whoami > /dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to npm. Run 'npm login' first.${NC}"
    exit 1
fi
NPM_USER=$(npm whoami)
echo -e "${GREEN}✓${NC} Logged in to npm as: $NPM_USER"

# Check gh CLI
if command -v gh &> /dev/null; then
    if gh auth status > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} GitHub CLI authenticated"
        HAS_GH=true
    else
        echo -e "${YELLOW}⚠️  GitHub CLI not authenticated (releases will be manual)${NC}"
        HAS_GH=false
    fi
else
    echo -e "${YELLOW}⚠️  GitHub CLI not installed (releases will be manual)${NC}"
    HAS_GH=false
fi

echo ""

# ============================================================================
# Version Handling
# ============================================================================

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Current version: ${CYAN}$CURRENT_VERSION${NC}"

VERSION_BUMP=$1

if [ -n "$VERSION_BUMP" ]; then
    case $VERSION_BUMP in
        patch|minor|major)
            echo -e "${BLUE}🔼 Bumping $VERSION_BUMP version...${NC}"
            npm version $VERSION_BUMP --no-git-tag-version
            NEW_VERSION=$(node -p "require('./package.json').version")
            echo -e "${GREEN}✓${NC} Version bumped to: $NEW_VERSION"
            ;;
        *)
            echo -e "${RED}❌ Invalid version bump type: $VERSION_BUMP${NC}"
            echo "   Valid options: patch, minor, major"
            exit 1
            ;;
    esac
else
    NEW_VERSION=$CURRENT_VERSION
fi

echo ""

# ============================================================================
# Build & Test
# ============================================================================

echo -e "${BLUE}🔨 Building...${NC}"
npm run build
echo -e "${GREEN}✓${NC} Build successful"

echo -e "${BLUE}🧪 Running tests...${NC}"
npm test
echo -e "${GREEN}✓${NC} All tests passed"

echo ""

# ============================================================================
# Git Operations
# ============================================================================

echo -e "${BLUE}📝 Creating git commit and tag...${NC}"

# Stage changes
git add package.json package-lock.json

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo -e "${YELLOW}⚠️  No changes to commit${NC}"
else
    git commit -m "chore: release v$NEW_VERSION"
    echo -e "${GREEN}✓${NC} Created commit"
fi

# Create tag
if git tag -l "v$NEW_VERSION" | grep -q "v$NEW_VERSION"; then
    echo -e "${YELLOW}⚠️  Tag v$NEW_VERSION already exists${NC}"
else
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
    echo -e "${GREEN}✓${NC} Created tag v$NEW_VERSION"
fi

echo ""

# ============================================================================
# Push to GitHub
# ============================================================================

echo -e "${BLUE}📤 Pushing to GitHub...${NC}"

read -p "Push to GitHub? (Y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    git push origin $CURRENT_BRANCH
    git push origin "v$NEW_VERSION"
    echo -e "${GREEN}✓${NC} Pushed to GitHub"
else
    echo -e "${YELLOW}⚠️  Skipped push to GitHub${NC}"
fi

echo ""

# ============================================================================
# Create GitHub Release
# ============================================================================

if [ "$HAS_GH" = true ]; then
    echo -e "${BLUE}🎉 Creating GitHub release...${NC}"
    
    # Extract changelog for this version
    RELEASE_NOTES=$(awk "/## \[$NEW_VERSION\]/,/## \[/" CHANGELOG.md | head -n -1)
    
    if [ -z "$RELEASE_NOTES" ]; then
        RELEASE_NOTES="Release v$NEW_VERSION"
    fi
    
    gh release create "v$NEW_VERSION" \
        --title "v$NEW_VERSION" \
        --notes "$RELEASE_NOTES"
    
    echo -e "${GREEN}✓${NC} GitHub release created"
else
    echo -e "${YELLOW}⚠️  Skipping GitHub release (gh CLI not available)${NC}"
fi

echo ""

# ============================================================================
# Publish to npm
# ============================================================================

echo -e "${BLUE}📦 Publishing to npm...${NC}"

read -p "Publish to npm? (Y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    npm publish --access public
    echo -e "${GREEN}✓${NC} Published to npm"
else
    echo -e "${YELLOW}⚠️  Skipped npm publish${NC}"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    🎉 Release Complete!                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "  ${CYAN}Version:${NC}  v$NEW_VERSION"
echo -e "  ${CYAN}npm:${NC}      npm install -g @struktos/prisma@$NEW_VERSION"
echo -e "  ${CYAN}npx:${NC}      npx @struktos/cli@$NEW_VERSION new my-app"
echo ""
echo -e "${GREEN}Done!${NC}"
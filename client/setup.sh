#!/bin/bash

# Frontend Setup Script
# This script automates the setup process for the frontend

echo "🚀 Workshop Management System - Frontend Setup"
echo "=============================================="
echo ""

# Step 1: Check Node.js
echo "📌 Step 1: Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 16+."
    exit 1
fi
echo "✅ Node.js $(node --version) found"
echo ""

# Step 2: Install dependencies
echo "📌 Step 2: Installing dependencies..."
if [ -d "node_modules" ]; then
    echo "⚠️  node_modules already exists. Skipping npm install."
else
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed"
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi
echo ""

# Step 3: Create .env.local
echo "📌 Step 3: Setting up environment variables..."
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local already exists. Skipping."
else
    cp .env.example .env.local
    echo "✅ Created .env.local"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env.local and add:"
    echo "   - VITE_API_URL (default: http://localhost:4000)"
    echo "   - VITE_GOOGLE_CLIENT_ID (optional, for real Google login)"
fi
echo ""

# Step 4: Summary
echo "=============================================="
echo "✅ Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.local with your configuration"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:5173"
echo ""
echo "Documentation:"
echo "- Setup guide: FRONTEND_SETUP.md"
echo "- Quick start: ../FRONTEND_QUICK_START.md"
echo "- Implementation summary: ../FRONTEND_IMPLEMENTATION_SUMMARY.md"
echo ""

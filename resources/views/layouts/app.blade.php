<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>ระบบประมาณการรายรับเงินรายได้ | คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มช.</title>

    <!-- Google Fonts: Sarabun -->
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- Tailwind CSS (CDN — No build step required) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Sarabun', 'sans-serif'],
                    },
                    colors: {
                        cmu: {
                            purple: '#5b2c83',
                            dark: '#3b1c57',
                            light: '#f3edf9',
                            gold: '#fde047',
                        }
                    }
                }
            }
        }
    </script>

    <!-- Vue.js 3 Global Build (CDN, Non-SFC — Edit Blade and refresh directly) -->
    <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>

    <style>
        body { font-family: 'Sarabun', sans-serif; background-color: #f1f5f9; color: #0f172a; }
        .excel-input {
            background-color: #fef9c3 !important;
            border: 1px solid #eab308;
            border-radius: 0.25rem;
            padding: 0.25rem 0.5rem;
            color: #1d4ed8;
            font-weight: 600;
            width: 100%;
            font-variant-numeric: tabular-nums;
        }
        .excel-input:focus { outline: 2px solid #2563eb; background-color: #fef08a !important; }
        .excel-input:disabled { background-color: #f1f5f9 !important; border-color: #cbd5e1; color: #64748b; cursor: not-allowed; }
        .calc-cell { background-color: #f8fafc; color: #334155; font-variant-numeric: tabular-nums; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        [v-cloak] { display: none; }
        @media print { .no-print { display: none !important; } }
    </style>
</head>
<body class="antialiased">
    @yield('content')
</body>
</html>

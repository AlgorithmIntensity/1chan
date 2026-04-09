/*!
 * 1chan-board.js — Работа с Google Apps Script
 */

(function(){
    // ==================== КОНФИГУРАЦИЯ ====================
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxItMq92xQbaILarlSSwlZOF8vNxFEIdvASTEFLoMlVPivg_jaLtI3mgAxE__7G9G4t/exec';
    const RECAPTCHA_SITE_KEY = '6Ldzwq4sAAAAACPSqVScyDXHTyaV3wUPvnyOuukq';
    
    // Получаем доску из URL (?brd=a)
    const urlParams = new URLSearchParams(window.location.search);
    const BOARD = urlParams.get('brd') || 'b';
    
    let threads = [];
    let expandedReplies = new Set();

    // Названия досок
    const BOARD_NAMES = {
        'a': 'Аниме и манга',
        'b': 'Random',
        'v': 'Видеоигры',
        'pol': 'Политика',
        'q': 'Сообщить об ошибке'
    };

    const BOARD_DESCS = {
        'a': 'Обсуждение аниме, манги, ранобэ и связанной культуры.',
        'b': 'Свободное общение. Правила действуют, но атмосфера расслабленная.',
        'v': 'Все платформы, жанры, новости и обсуждения игр.',
        'pol': 'Политические дискуссии. Без оскорблений и переходов на личности.',
        'q': 'Сообщения об ошибках, багах и предложения по улучшению 1chan.'
    };

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    function init() {
        document.getElementById('boardName').textContent = `/${BOARD}/ — ${BOARD_NAMES[BOARD] || BOARD}`;
        document.getElementById('boardDesc').textContent = BOARD_DESCS[BOARD] || 'Доска 1chan';
        document.getElementById('catalogLink').href = `catalog.html?brd=${BOARD}`;
        
        loadThreads();
        
        document.getElementById('refreshBtn').addEventListener('click', loadThreads);
        document.getElementById('newThreadForm').addEventListener('submit', createThread);
    }

    // ==================== ЗАГРУЗКА ТРЕДОВ ====================
    async function loadThreads() {
        const statusEl = document.getElementById('syncStatus');
        statusEl.textContent = '⏳ Загрузка...';
        
        try {
            const url = `${SCRIPT_URL}?board=${BOARD}`;
            const response = await fetch(url);
            const data = await response.json();
            
            threads = Array.isArray(data) ? data : [];
            
            // Сортируем: закреплённые сверху, затем по ID (новые сверху)
            threads.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return parseInt(b.id) - parseInt(a.id);
            });
            
            renderThreads();
            statusEl.textContent = '✅ Загружено';
            setTimeout(() => { statusEl.textContent = ''; }, 2000);
        } catch (e) {
            console.error('Ошибка загрузки:', e);
            statusEl.textContent = '❌ Ошибка';
            renderThreads();
        }
    }

    // ==================== СОЗДАНИЕ ТРЕДА ====================
    async function createThread(e) {
        e.preventDefault();
        
        // Проверяем reCAPTCHA
        const recaptchaToken = grecaptcha.getResponse();
        if (!recaptchaToken) {
            alert('❌ Подтвердите, что вы не робот!');
            return;
        }
        
        const subjectEl = document.getElementById('threadSubject');
        const nameEl = document.getElementById('threadName');
        const commentEl = document.getElementById('threadComment');
        
        const subject = subjectEl.value.trim();
        const name = nameEl.value.trim() || 'Аноним';
        const comment = commentEl.value.trim();
        
        if (!comment) {
            alert('❌ Введите текст треда!');
            return;
        }
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳...';
        
        const newThread = {
            id: Date.now(),
            board: BOARD,
            subject: subject || 'Без темы',
            name: name,
            comment: comment,
            fileData: '',
            timestamp: new Date().toISOString(),
            replies: [],
            pinned: false,
            recaptchaToken: recaptchaToken  // Отправляем токен на сервер
        };
        
        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newThread)
            });
            
            // При no-cors ответ не читается, просто предполагаем успех
            subjectEl.value = '';
            nameEl.value = '';
            commentEl.value = '';
            grecaptcha.reset();
            
            alert('✅ Тред создан!');
            setTimeout(() => loadThreads(), 1000);
        } catch (error) {
            console.error('Ошибка создания треда:', error);
            alert('❌ Ошибка при создании треда');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    // ==================== ОТПРАВКА ОТВЕТА ====================
    async function submitReply(threadId) {
        const nameInput = document.getElementById(`replyName-${threadId}`);
        const commentInput = document.getElementById(`replyComment-${threadId}`);
        
        const name = nameInput.value.trim() || 'Аноним';
        const comment = commentInput.value.trim();
        
        if (!comment) {
            alert('❌ Введите текст ответа!');
            return;
        }
        
        // Находим тред
        const thread = threads.find(t => t.id == threadId);
        if (!thread) return;
        
        // Добавляем ответ
        const newReply = {
            name: name,
            comment: comment,
            timestamp: new Date().toISOString()
        };
        
        thread.replies.push(newReply);
        
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(thread)
            });
            
            nameInput.value = '';
            commentInput.value = '';
            
            const form = document.getElementById(`reply-form-${threadId}`);
            if (form) form.style.display = 'none';
            
            setTimeout(() => loadThreads(), 1000);
        } catch (error) {
            console.error('Ошибка отправки ответа:', error);
            alert('❌ Ошибка при отправке ответа');
        }
    }

    // ==================== ОТРИСОВКА ТРЕДОВ ====================
    function renderThreads() {
        const container = document.getElementById('threadsContainer');
        
        if (!threads.length) {
            container.innerHTML = `<div class="loading-message" style="color: #1a3a6b; text-align: center; padding: 40px;">
                Нет тредов. Создайте первый!
            </div>`;
            return;
        }

        let html = '';
        for (const t of threads) {
            const replies = t.replies || [];
            const replyCount = replies.length;
            const isExpanded = expandedReplies.has(String(t.id));
            
            let dateStr = 'Дата неизвестна';
            try {
                if (t.timestamp) dateStr = new Date(t.timestamp).toLocaleString('ru-RU');
            } catch(e) { dateStr = t.timestamp; }

            html += `<div class="thread-card-board" data-thread-id="${t.id}">
                <div class="thread-meta">
                    <span class="thread-id-large">№${t.id}</span>
                    <span style="font-weight: bold; color: #1a3a6b;">${escapeHtml(t.subject || 'Без темы')}</span>
                    <span style="color: #0066cc;">${escapeHtml(t.name || 'Аноним')}</span>
                    <span style="color: #4a6a9b; font-size: 12px;">${dateStr}</span>
                    ${t.pinned ? '<span style="color: #cc0000;">📌 Закреплён</span>' : ''}
                </div>
                <div class="thread-comment">${formatComment(t.comment)}</div>
                <div style="margin-top: 10px;">
                    <span class="reply-count" data-thread-id="${t.id}">
                        💬 ${replyCount} ${pluralize(replyCount, 'ответ', 'ответа', 'ответов')}
                    </span>
                    <button class="btn reply-to-thread-btn" data-thread-id="${t.id}" style="margin-left: 10px;">↩ Ответить</button>
                </div>
                <div class="replies-container" id="replies-${t.id}" ${isExpanded ? 'style="display: block;"' : ''}>
                    ${renderReplies(replies)}
                    <div class="reply-form-inline" id="reply-form-${t.id}" style="display: none; margin-top: 15px; padding: 10px; background: #f9f9f9; border: 1px solid #2a5a9b;">
                        <input type="text" id="replyName-${t.id}" placeholder="Имя (Аноним)" style="width: 200px; margin-bottom: 8px; padding: 5px;">
                        <textarea id="replyComment-${t.id}" rows="2" placeholder="Текст ответа..." style="width: 100%; margin-bottom: 8px; padding: 5px;"></textarea>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn submit-reply-btn" data-thread-id="${t.id}">Отправить</button>
                            <button class="btn cancel-reply-btn" data-thread-id="${t.id}">Отмена</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }
        
        container.innerHTML = html;
        attachEvents();
    }

    function renderReplies(replies) {
        if (!replies || !replies.length) {
            return '<div style="color: #4a6a9b; padding: 5px;">Нет ответов</div>';
        }
        
        let html = '';
        for (const r of replies) {
            let dateStr = '';
            try {
                dateStr = new Date(r.timestamp).toLocaleString('ru-RU');
            } catch(e) { dateStr = r.timestamp || ''; }
            
            html += `<div class="single-reply">
                <strong style="color: #1a3a6b;">${escapeHtml(r.name || 'Аноним')}</strong>
                <span style="color: #0066cc; font-size: 11px; margin-left: 10px;">${dateStr}</span>
                <div style="margin-top: 5px;">${formatComment(r.comment)}</div>
            </div>`;
        }
        return html;
    }

    function formatComment(text) {
        if (!text) return '';
        return escapeHtml(text)
            .replace(/&gt;&gt;(\d+)/g, '<a href="#" class="post-link" data-post-id="$1">&gt;&gt;$1</a>')
            .replace(/\n/g, '<br>');
    }

    // ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================
    function attachEvents() {
        // Раскрытие/скрытие ответов
        document.querySelectorAll('.reply-count').forEach(el => {
            el.addEventListener('click', () => {
                const threadId = el.dataset.threadId;
                const repliesDiv = document.getElementById(`replies-${threadId}`);
                if (repliesDiv) {
                    if (repliesDiv.style.display === 'block') {
                        repliesDiv.style.display = 'none';
                        expandedReplies.delete(threadId);
                    } else {
                        repliesDiv.style.display = 'block';
                        expandedReplies.add(threadId);
                    }
                }
            });
        });

        // Кнопка "Ответить"
        document.querySelectorAll('.reply-to-thread-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const threadId = btn.dataset.threadId;
                const form = document.getElementById(`reply-form-${threadId}`);
                if (form) {
                    form.style.display = form.style.display === 'none' ? 'block' : 'none';
                }
            });
        });

        // Отмена ответа
        document.querySelectorAll('.cancel-reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const threadId = btn.dataset.threadId;
                const form = document.getElementById(`reply-form-${threadId}`);
                if (form) {
                    form.style.display = 'none';
                    document.getElementById(`replyName-${threadId}`).value = '';
                    document.getElementById(`replyComment-${threadId}`).value = '';
                }
            });
        });

        // Отправка ответа
        document.querySelectorAll('.submit-reply-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const threadId = btn.dataset.threadId;
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = '⏳...';
                
                await submitReply(threadId);
                
                btn.disabled = false;
                btn.textContent = originalText;
            });
        });
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function pluralize(count, one, two, five) {
        const n = Math.abs(count) % 100;
        if (n >= 11 && n <= 19) return five;
        const i = n % 10;
        if (i === 1) return one;
        if (i >= 2 && i <= 4) return two;
        return five;
    }

    // Запуск
    init();
})();

<script lang="ts">
  import { onMount } from "svelte";
  import { fetchMeta } from "$lib/api";
  import { language, setLanguage } from "$lib/stores/i18n";
  import type { LanguageTag } from "$lib/i18n/dictionary";

  type PublicPage = "about" | "guide" | "faq" | "contact" | "privacy" | "terms";
  type FeatureCard = { title: string; copy: string };
  type StepCard = { title: string; copy: string };
  type FaqItem = { question: string; answer: string };

  type PublicCopy = {
    language: string;
    product: string;
    about: string;
    guide: string;
    faq: string;
    contact: string;
    privacy: string;
    terms: string;
    openApp: string;
    eyebrow: string;
    backToProduct: string;
    footerCopy: string;
    aboutTitle: string;
    aboutIntro: string;
    aboutBody: string;
    productPointsTitle: string;
    productPoints: FeatureCard[];
    guideTitle: string;
    guideIntro: string;
    guideLeadIn: string;
    guideSteps: StepCard[];
    faqTitle: string;
    faqIntro: string;
    faqItems: FaqItem[];
    contactTitle: string;
    contactIntro: string;
    contactEmailLabel: string;
    contactUnavailable: string;
    contactSupportNote: string;
    privacyTitle: string;
    privacyIntro: string;
    privacyAccountTitle: string;
    privacyAccountCopy: string;
    privacyBudgetTitle: string;
    privacyBudgetCopy: string;
    privacyChoicesTitle: string;
    privacyChoicesCopy: string;
    termsTitle: string;
    termsIntro: string;
    termsUseTitle: string;
    termsUseCopy: string;
    termsTrialTitle: string;
    termsTrialCopy: string;
    termsDisclaimerTitle: string;
    termsDisclaimerCopy: string;
  };

  const copy: Record<LanguageTag, PublicCopy> = {
    en: {
      language: "Language",
      product: "Product",
      about: "About",
      guide: "Guide",
      faq: "FAQ",
      contact: "Contact",
      privacy: "Privacy",
      terms: "Terms",
      openApp: "Open workspace",
      eyebrow: "Family Weekly Budget",
      backToProduct: "Back to product",
      footerCopy: "A private budgeting workspace for calmer monthly decisions.",
      aboutTitle: "A clearer way to understand everyday spending.",
      aboutIntro:
        "Family Weekly Budget is a private budgeting workspace for people who want a calm, repeatable way to review spending across each month.",
      aboutBody:
        "Instead of trying to force everything into a spreadsheet, the product brings together weekly updates, monthly statements, category summaries, charts, and transaction review in one place. That gives visitors a clearer picture of what the app does, why it exists, and how it helps people stay organised without exposing app-only controls.",
      productPointsTitle: "What the product helps you do",
      productPoints: [
        {
          title: "Start with a weekly rhythm",
          copy: "Capture the latest bank or card activity once a week, review category hints, and save only the rows you trust.",
        },
        {
          title: "Read the month at a glance",
          copy: "Monthly status, period records, and trend charts work together so you can see pace, balance, and unusual changes quickly.",
        },
        {
          title: "Keep household contexts separate",
          copy: "Workspaces keep different families, planning scenarios, or test data apart so one budget does not overwrite another.",
        },
        {
          title: "Protect private data handling",
          copy: "The public site explains the product without exposing protected app controls, imported transactions, or account-only actions.",
        },
      ],
      guideTitle: "How the app works",
      guideIntro:
        "This page is the practical starting point for someone who just discovered the product and wants to understand the flow before signing in.",
      guideLeadIn: "The best way to use the app is to follow the same small loop every week.",
      guideSteps: [
        {
          title: "Choose the right workspace",
          copy:
            "Treat a workspace as one budget context. Families, tests, or separate projects can all live apart without mixing data.",
        },
        {
          title: "Update the next period",
          copy:
            "Paste transaction rows, review categories, and confirm only the rows that should be applied to the current week.",
        },
        {
          title: "Check for duplicates and outliers",
          copy:
            "Duplicate candidates stay visible during review so you can decide whether a row should be kept, adjusted, or excluded.",
        },
        {
          title: "Save the period",
          copy:
            "Once you save, the weekly period becomes part of the historical record and the monthly view updates with the latest totals.",
        },
        {
          title: "Read the month afterward",
          copy:
            "Use monthly status, charts, and period records to understand whether spending is on pace or drifting away from expectation.",
        },
        {
          title: "Return when needed",
          copy:
            "The app keeps account access, language, and workspace controls in the product so returning users can jump straight back in.",
        },
      ],
      faqTitle: "Frequently asked questions",
      faqIntro:
        "These answers are written for a new visitor who wants to know whether the product is useful, private, and easy to keep using.",
      faqItems: [
        {
          question: "Do I need a spreadsheet to use this product?",
          answer:
            "No. The app is designed so weekly review, category summaries, monthly statements, and charts all live in the same interface.",
        },
        {
          question: "Can I keep different households separate?",
          answer:
            "Yes. Workspaces are separated so one household, scenario, or test dataset does not mix with another.",
        },
        {
          question: "What if I use Google sign-in?",
          answer:
            "Google sign-in is used for access control and account recognition. The public site explains the product without asking visitors to enter bank credentials.",
        },
        {
          question: "What happens when duplicate transactions appear?",
          answer:
            "Duplicate candidates stay visible during review so you can keep the record, adjust the amount, or exclude it before the period is saved.",
        },
        {
          question: "Can I see a quick monthly picture?",
          answer:
            "Yes. Monthly status, period records, and trend charts show how the current month is tracking without forcing you to open every transaction.",
        },
        {
          question: "Where should I go if I need help?",
          answer:
            "Use the contact page or the service owner's support details if you want access help, onboarding help, or privacy questions answered.",
        },
      ],
      contactTitle: "Contact and onboarding support",
      contactIntro:
        "Questions about access, onboarding, or product behaviour can be directed to the service owner. Visitors are never asked to submit bank credentials or financial account passwords through the public website.",
      contactEmailLabel: "Service contact",
      contactUnavailable: "Contact details are provided by the service owner during onboarding.",
      contactSupportNote:
        "If you are evaluating the product for a household, it helps to keep one contact point for setup questions, account recovery, and onboarding guidance.",
      privacyTitle: "Privacy overview",
      privacyIntro: "This page describes the main data-handling principles for Family Weekly Budget.",
      privacyAccountTitle: "Account and sign-in data",
      privacyAccountCopy:
        "Depending on the sign-in method, the service may process a display name, email address, authentication provider identifier, and session information. Google sign-in data is used to create or open the associated account and protect access to it.",
      privacyBudgetTitle: "Budget data",
      privacyBudgetCopy:
        "Information entered into a workspace can include balances, periods, categories, notes, and transaction records. This data is used to provide the budgeting features and is kept separated by account and workspace.",
      privacyChoicesTitle: "Your choices",
      privacyChoicesCopy:
        "You can stop using the service, request account or data assistance from the service owner, and avoid entering sensitive banking credentials into transaction import fields. Contact the service owner for deletion or access questions.",
      termsTitle: "Terms of use",
      termsIntro: "These baseline terms describe the intended use of Family Weekly Budget.",
      termsUseTitle: "Use the service responsibly",
      termsUseCopy:
        "Use the service only with data you are authorised to manage. Do not attempt to access another account or workspace, interfere with the service, or submit content that is unlawful or harmful.",
      termsTrialTitle: "Trial access",
      termsTrialCopy:
        "Trial access may have limits and may be changed or withdrawn by the service owner. Account access is personal to the authorised user and should not be shared.",
      termsDisclaimerTitle: "Not financial advice",
      termsDisclaimerCopy:
        "The service organises information you provide. Its calculations, summaries, and charts are not financial, legal, tax, or investment advice. Check important decisions against your original records.",
    },
    zh: {
      language: "語言",
      product: "產品",
      about: "關於",
      guide: "指南",
      faq: "常見問題",
      contact: "聯絡",
      privacy: "隱私",
      terms: "條款",
      openApp: "開啟工作區",
      eyebrow: "Family Weekly Budget",
      backToProduct: "回到產品頁",
      footerCopy: "讓每月決策更清楚的私人預算工作區。",
      aboutTitle: "用更清楚的方式理解日常支出。",
      aboutIntro:
        "Family Weekly Budget 是一個私人預算工作區，適合想用穩定、可重複的方式檢視每月支出的使用者。",
      aboutBody:
        "這個產品把每週更新、月度總結、分類摘要、圖表和交易檢視整合在同一個地方。對訪客來說，它不是單純的登入頁，而是一個可以理解產品用途、功能結構與使用方式的公開網站。",
      productPointsTitle: "這個產品能幫你做到的事",
      productPoints: [
        {
          title: "建立每週節奏",
          copy: "每週整理一次最新交易，檢查分類提示，並且只儲存你確認過的資料。",
        },
        {
          title: "一眼看懂整個月份",
          copy: "月度狀態、週期紀錄與趨勢圖表一起工作，幫你快速看出支出速度、可用餘額與異常變化。",
        },
        {
          title: "區分不同家庭或情境",
          copy: "工作區可以把不同家庭、規劃情境或測試資料分開，避免彼此混在一起。",
        },
        {
          title: "保護私有資料處理",
          copy: "公開網站只說明產品，不暴露登入後才有的功能、匯入交易或帳號專屬操作。",
        },
      ],
      guideTitle: "實際怎麼使用",
      guideIntro:
        "這一頁是給第一次接觸產品的人看的，重點是先理解流程，再決定是否登入。",
      guideLeadIn: "最好的使用方式，是每週都走一次相同的小流程。",
      guideSteps: [
        {
          title: "先選對工作區",
          copy: "把工作區當成一個預算情境。家庭、測試或不同規劃都可以分開，不會互相覆蓋。",
        },
        {
          title: "更新下一個週期",
          copy: "貼上交易資料、檢查分類提示，然後只確認要套用到本週的資料列。",
        },
        {
          title: "檢查重複與異常",
          copy: "在檢視階段，重複候選會保留在畫面上，讓你決定要保留、修正或排除。",
        },
        {
          title: "儲存週期",
          copy: "儲存後，這個週期會成為歷史紀錄的一部分，月度畫面也會更新最新數值。",
        },
        {
          title: "再看月度總覽",
          copy: "用月度狀態、圖表和週期紀錄，快速理解目前是否還在預期支出速度內。",
        },
        {
          title: "需要時再回來",
          copy: "語言、工作區與帳號控制都放在產品中，讓回訪使用者可以直接回到工作。",
        },
      ],
      faqTitle: "常見問題",
      faqIntro:
        "以下回答是給第一次看到這個產品的人，讓你快速判斷它是否實用、私密、而且容易持續使用。",
      faqItems: [
        {
          question: "我一定要用試算表嗎？",
          answer: "不用。這個產品把每週檢視、分類摘要、月度總結和圖表放在同一個介面中。",
        },
        {
          question: "可以把不同家庭分開嗎？",
          answer: "可以。工作區彼此分離，所以同一個家庭、情境或測試資料不會混在一起。",
        },
        {
          question: "如果我用 Google 登入呢？",
          answer: "Google 登入是用來做帳號識別與存取保護。公開網站不會要求訪客輸入銀行密碼。",
        },
        {
          question: "交易出現重複候選時會怎樣？",
          answer: "在審核階段會保留重複候選，讓你決定保留、調整金額或排除後再儲存。",
        },
        {
          question: "可以快速看出這個月的狀況嗎？",
          answer: "可以。月度狀態、週期紀錄與趨勢圖表會一起顯示，讓你不用打開每一筆交易也能看懂方向。",
        },
        {
          question: "如果我需要協助該找誰？",
          answer: "可以從聯絡頁面或服務管理者的支援方式取得登入、導入或隱私相關協助。",
        },
      ],
      contactTitle: "聯絡與導入協助",
      contactIntro:
        "如果你對存取、導入流程或產品行為有問題，可以聯絡服務管理者。公開網站不會要求訪客提交銀行登入資料或金融帳戶密碼。",
      contactEmailLabel: "服務聯絡方式",
      contactUnavailable: "聯絡方式會由服務管理者在導入時提供。",
      contactSupportNote:
        "如果你正在評估給一個家庭使用，最好保留一個固定聯絡點來處理設定、帳號恢復與導入問題。",
      privacyTitle: "隱私權概覽",
      privacyIntro: "這一頁說明 Family Weekly Budget 的主要資料處理原則。",
      privacyAccountTitle: "帳號與登入資料",
      privacyAccountCopy:
        "依照登入方式不同，服務可能會處理顯示名稱、電子郵件、驗證提供者識別碼與工作階段資訊。Google 登入資料只用來建立或開啟對應帳號，以及保護帳號存取。",
      privacyBudgetTitle: "預算資料",
      privacyBudgetCopy:
        "工作區中的資料可能包含餘額、週期、分類、備註與交易紀錄。這些資料會用來提供預算功能，並依帳號與工作區分開保存。",
      privacyChoicesTitle: "你的選擇",
      privacyChoicesCopy:
        "你可以停止使用服務、向服務管理者要求帳號或資料協助，也不應在交易匯入欄位輸入敏感的銀行登入資訊。若有刪除或存取問題，請聯絡服務管理者。",
      termsTitle: "使用條款",
      termsIntro: "以下基礎條款說明 Family Weekly Budget 的預期使用方式。",
      termsUseTitle: "請負責任地使用服務",
      termsUseCopy:
        "請只使用你有權管理的資料。不要嘗試存取其他帳號或工作區、干擾服務運作，或提交違法與有害內容。",
      termsTrialTitle: "試用存取",
      termsTrialCopy:
        "試用存取可能有使用限制，也可能由服務管理者調整或撤回。帳號存取屬於授權使用者，不應與他人共用。",
      termsDisclaimerTitle: "非財務建議",
      termsDisclaimerCopy:
        "本服務只會整理你提供的資訊。其計算、摘要與圖表不構成財務、法律、稅務或投資建議。重要決策請仍以原始紀錄為準。",
    },
  } as const;

  let currentPath = $state(typeof window === "undefined" ? "/about" : window.location.pathname);
  let contactEmail = $state("");
  const currentPage = $derived<PublicPage>(getPage(currentPath));
  const currentCopy = $derived(copy[$language] ?? copy.en);

  function getPage(pathname: string): PublicPage {
    if (pathname === "/guide") return "guide";
    if (pathname === "/faq") return "faq";
    if (pathname === "/contact") return "contact";
    if (pathname === "/privacy") return "privacy";
    if (pathname === "/terms") return "terms";
    return "about";
  }

  function pageTitle(page: PublicPage): string {
    switch (page) {
      case "guide":
        return currentCopy.guideTitle;
      case "faq":
        return currentCopy.faqTitle;
      case "contact":
        return currentCopy.contactTitle;
      case "privacy":
        return currentCopy.privacyTitle;
      case "terms":
        return currentCopy.termsTitle;
      default:
        return currentCopy.aboutTitle;
    }
  }

  function pageDescription(page: PublicPage): string {
    switch (page) {
      case "guide":
        return currentCopy.guideIntro;
      case "faq":
        return currentCopy.faqIntro;
      case "contact":
        return currentCopy.contactIntro;
      case "privacy":
        return currentCopy.privacyIntro;
      case "terms":
        return currentCopy.termsIntro;
      default:
        return currentCopy.aboutIntro;
    }
  }

  $effect(() => {
    document.title = `${pageTitle(currentPage)} | Family Weekly Budget`;
  });

  onMount(() => {
    const onPopState = () => (currentPath = window.location.pathname);
    window.addEventListener("popstate", onPopState);
    void fetchMeta()
      .then((meta) => (contactEmail = meta.contactEmail || ""))
      .catch(() => {});
    return () => window.removeEventListener("popstate", onPopState);
  });
</script>

<svelte:head>
  <meta name="description" content={pageDescription(currentPage)} />
  <meta name="robots" content="index,follow" />
</svelte:head>

<div class="public-page public-site">
  <header class="public-header">
    <a class="public-brand" href="/" aria-label={currentCopy.backToProduct}>
      <span class="public-brand-mark">$</span>
      <span>
        <strong>Family Weekly Budget</strong>
        <small>{currentCopy.footerCopy}</small>
      </span>
    </a>

    <nav aria-label={currentCopy.product}>
      <a href="/">{currentCopy.product}</a>
      <a href="/guide">{currentCopy.guide}</a>
      <a href="/faq">{currentCopy.faq}</a>
      <a href="/about">{currentCopy.about}</a>
      <a href="/contact">{currentCopy.contact}</a>
      <a href="/privacy">{currentCopy.privacy}</a>
      <a href="/terms">{currentCopy.terms}</a>
    </nav>

    <div class="public-actions">
      <label>
        <span class="visually-hidden">{currentCopy.language}</span>
        <select value={$language} onchange={(event) => setLanguage((event.currentTarget as HTMLSelectElement).value as LanguageTag)}>
          <option value="en">English</option>
          <option value="zh">繁體中文</option>
        </select>
      </label>
      <a class="public-app-link" href="/app">{currentCopy.openApp}</a>
    </div>
  </header>

  <main class="public-main">
    <section class="public-hero">
      <p class="eyebrow">{currentCopy.eyebrow}</p>
      <div class="public-hero-layout">
        <div>
          <h1>{pageTitle(currentPage)}</h1>
          <p class="public-hero-copy">{pageDescription(currentPage)}</p>
        </div>
        <aside class="public-hero-aside">
          <p class="public-hero-aside-label">{currentPage === "guide" ? currentCopy.guideLeadIn : currentCopy.productPointsTitle}</p>
          {#if currentPage === "guide"}
            <p>{currentCopy.guideLeadIn}</p>
          {:else if currentPage === "faq"}
            <p>{currentCopy.faqIntro}</p>
          {:else}
            <p>{currentCopy.aboutBody}</p>
          {/if}
        </aside>
      </div>
    </section>

    {#if currentPage === "about"}
      <section class="public-section">
        <h2>{currentCopy.productPointsTitle}</h2>
        <div class="public-card-grid public-card-grid--wide">
          {#each currentCopy.productPoints as point}
            <article>
              <h3>{point.title}</h3>
              <p>{point.copy}</p>
            </article>
          {/each}
        </div>
      </section>
    {:else if currentPage === "guide"}
      <section class="public-section">
        <h2>{currentCopy.guideTitle}</h2>
        <div class="public-step-grid">
          {#each currentCopy.guideSteps as step, index}
            <article class="public-step-card">
              <p class="public-step-index">Step {index + 1}</p>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          {/each}
        </div>
      </section>
    {:else if currentPage === "faq"}
      <section class="public-section">
        <h2>{currentCopy.faqTitle}</h2>
        <div class="public-faq-list">
          {#each currentCopy.faqItems as item}
            <details class="public-faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          {/each}
        </div>
      </section>
    {:else if currentPage === "contact"}
      <section class="public-card-grid public-card-grid--single">
        <article>
          <h2>{currentCopy.contactEmailLabel}</h2>
          {#if contactEmail}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          {:else}
            <p>{currentCopy.contactUnavailable}</p>
          {/if}
          <p>{currentCopy.contactSupportNote}</p>
        </article>
      </section>
    {:else if currentPage === "privacy"}
      <section class="public-card-grid">
        <article>
          <h2>{currentCopy.privacyAccountTitle}</h2>
          <p>{currentCopy.privacyAccountCopy}</p>
        </article>
        <article>
          <h2>{currentCopy.privacyBudgetTitle}</h2>
          <p>{currentCopy.privacyBudgetCopy}</p>
        </article>
        <article>
          <h2>{currentCopy.privacyChoicesTitle}</h2>
          <p>{currentCopy.privacyChoicesCopy}</p>
        </article>
      </section>
    {:else}
      <section class="public-card-grid">
        <article>
          <h2>{currentCopy.termsUseTitle}</h2>
          <p>{currentCopy.termsUseCopy}</p>
        </article>
        <article>
          <h2>{currentCopy.termsTrialTitle}</h2>
          <p>{currentCopy.termsTrialCopy}</p>
        </article>
        <article>
          <h2>{currentCopy.termsDisclaimerTitle}</h2>
          <p>{currentCopy.termsDisclaimerCopy}</p>
        </article>
      </section>
    {/if}
  </main>

  <footer class="public-footer">
    <span>{currentCopy.footerCopy}</span>
    <div class="public-footer-links">
      <a href="/guide">{currentCopy.guide}</a>
      <a href="/faq">{currentCopy.faq}</a>
      <a href="/privacy">{currentCopy.privacy}</a>
      <a href="/terms">{currentCopy.terms}</a>
      <a href="/">{currentCopy.backToProduct}</a>
    </div>
  </footer>
</div>

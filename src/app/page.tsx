import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";
import MindFlowMark from "./MindFlowMark";

export const metadata: Metadata = {
  title: "MindFlow — мысли в ясность",
  description:
    "MindFlow превращает свободную голосовую рефлексию в ясный итог, содержательные инсайты и конкретные следующие шаги.",
};

const benefits = [
  {
    number: "01",
    title: "Что возвращается",
    text: "MindFlow связывает похожие мысли из разных дней и помогает увидеть тему целиком.",
  },
  {
    number: "02",
    title: "Что не меняется",
    text: "Повторяющийся сценарий перестаёт быть фоном и становится понятной точкой внимания.",
  },
  {
    number: "03",
    title: "Что делать дальше",
    text: "Если в рефлексии есть намерение, оно остаётся коротким и самостоятельным следующим шагом.",
  },
];

const steps = [
  {
    number: "1",
    title: "Говорите как есть",
    text: "После дня, прогулки или встречи. Без шаблона, красивых формулировок и ручной сортировки мыслей.",
  },
  {
    number: "2",
    title: "Получите ясный разбор",
    text: "MindFlow соберёт краткий итог, темы, содержательные инсайты и возможные действия из вашей записи.",
  },
  {
    number: "3",
    title: "Смотрите на себя во времени",
    text: "Возвращайтесь к истории и замечайте, какие намерения, вопросы и ситуации появляются снова.",
  },
];

const trustPoints = [
  {
    title: "Опирается на ваши слова",
    text: "Выводы строятся вокруг фактов и связей, которые действительно есть в рефлексии.",
  },
  {
    title: "Не играет в психолога",
    text: "Без диагнозов, ярлыков и уверенных догадок о скрытых мотивах.",
  },
  {
    title: "Не превращает всё в задачи",
    text: "Твои намерения остаются отдельно, а предложение MindFlow становится шагом только после твоего подтверждения.",
  },
  {
    title: "Сохраняет личное личным",
    text: "Записи привязаны к вашему аккаунту и доступны только вам.",
  },
];

export default function Home() {
  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <header className={`${styles.container} ${styles.nav}`}>
          <Link className={styles.brand} href="/" aria-label="MindFlow">
            <span className={styles.brandMark} aria-hidden="true">
              <MindFlowMark />
            </span>
            <span>MindFlow</span>
          </Link>

          <nav className={styles.navLinks} aria-label="Навигация по странице">
            <a href="#example">Пример</a>
            <a href="#how">Как работает</a>
            <a href="#trust">Доверие</a>
          </nav>

          <Link className={styles.navAction} href="/app">
            Открыть дневник
          </Link>
        </header>

        <main>
          <section className={`${styles.container} ${styles.hero}`}>
            <div className={styles.heroCopy}>
              <div className={styles.pill}>Голосовая рефлексия → ясность → движение</div>
              <h1>Не просто выговориться. Понять, что важно и что делать дальше.</h1>
              <p className={styles.lead}>
                MindFlow превращает свободный рассказ после дня, прогулки или
                встречи в ясный разбор: собирает суть, формулирует сильные
                выводы и сохраняет конкретные намерения. Со временем отдельные
                записи складываются в личную картину.
              </p>
              <div className={styles.heroActions}>
                <Link className={`${styles.button} ${styles.primary}`} href="/app">
                  Записать первую мысль
                </Link>
                <a className={`${styles.button} ${styles.secondary}`} href="#example">
                  Посмотреть пример
                </a>
              </div>
              <p className={styles.heroNote}>
                Говорите как есть — структуру соберёт MindFlow.
              </p>
            </div>

            <div className={styles.heroVisual} aria-label="Пример разбора MindFlow">
              <div className={styles.orb} aria-hidden="true" />
              <div className={styles.analysisPanel}>
                <div className={styles.panelTopline}>
                  <span>Сегодня · 21:48</span>
                  <span className={styles.panelStatus}>Разобрано</span>
                </div>
                <div className={styles.voiceCard}>
                  <span className={styles.eyebrow}>Голосовая мысль</span>
                  <p>
                    «Уже неделю сравниваю три направления и всё не могу
                    выбрать. Боюсь остановиться на одном, потратить время, а
                    потом понять, что нужно было идти в другое».
                  </p>
                  <div className={styles.wave} aria-hidden="true">
                    {[20, 38, 27, 46, 31, 42, 24, 35].map((height, index) => (
                      <i key={index} style={{ height }} />
                    ))}
                  </div>
                </div>
                <div className={styles.resultCard}>
                  <span className={styles.eyebrow}>Главный инсайт</span>
                  <p>
                    Попытка заранее исключить ошибку делает любой выбор слишком
                    рискованным. Для уверенного решения нужна практическая
                    проверка.
                  </p>
                </div>
                <div className={styles.actionCard}>
                  <span className={styles.actionIcon} aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <span>Подсказка MindFlow</span>
                    <b>Выбрать одно направление для короткого теста</b>
                  </div>
                </div>
              </div>
              <div className={styles.patternNote}>
                <span>Новая информация</span>
                <p>
                  Небольшая реальная задача даст для выбора больше, чем ещё одно
                  сравнение.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.exampleSection} id="example">
            <div className={styles.container}>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.kicker}>После рефлексии</span>
                  <h2>Из длинного рассказа — то, что хочется забрать с собой</h2>
                </div>
                <p>
                  MindFlow не требует говорить по плану. Он сохраняет живую
                  мысль, а рядом собирает короткий разбор, к которому легко
                  вернуться позже.
                </p>
              </div>

              <div className={styles.beforeAfter}>
                <article className={styles.transcriptCard}>
                  <div className={styles.cardLabel}>
                    <span className={styles.dot} />
                    Как это звучало
                  </div>
                  <blockquote>
                    «Уже неделю сравниваю три направления и всё не могу выбрать.
                    Каждый раз кажется, что в другом варианте может быть что-то
                    важнее или перспективнее. Боюсь остановиться на одном,
                    потратить время, а потом понять, что нужно было идти в
                    другое».
                  </blockquote>
                  <div className={styles.transcriptMeta}>
                    <span>Свободная запись</span>
                    <span>Без шаблона</span>
                  </div>
                </article>

                <article className={styles.summaryCard}>
                  <div className={styles.cardLabel}>Что собрал MindFlow</div>
                  <div className={styles.summaryBlock}>
                    <span>Краткий итог</span>
                    <p>
                      Выбор между тремя направлениями превратился в постоянное
                      сравнение. Опасение потратить время не на тот вариант не
                      позволяет начать ни с одного из них.
                    </p>
                  </div>
                  <div className={styles.mainInsight}>
                    <span>Главный инсайт</span>
                    <p>
                      Попытка заранее исключить ошибку делает любой выбор
                      слишком рискованным. Но в текущих обстоятельствах
                      невозможно найти идеальное направление только через
                      размышления: для более уверенного решения нужна новая
                      информация, которую может дать практическая проверка.
                    </p>
                  </div>
                  <div className={styles.nextStep}>
                    <span>Подсказка MindFlow</span>
                    <p>
                      Выбрать одно направление не навсегда, а для короткого
                      теста. Придумать небольшую реальную задачу, выполнить её и
                      после этого сравнить ожидания с собственным опытом.
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className={`${styles.container} ${styles.howSection}`} id="how">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.kicker}>Как это работает</span>
                <h2>Одна простая привычка. Всё остальное берёт на себя дневник.</h2>
              </div>
              <p>
                Не нужно вести таблицы, выбирать категории или каждый раз
                решать, как оформить мысль.
              </p>
            </div>

            <div className={styles.stepsGrid}>
              {steps.map((step) => (
                <article className={styles.stepCard} key={step.number}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.timeSection}>
            <div className={`${styles.container} ${styles.timePanel}`}>
              <div className={styles.timeCopy}>
                <span className={styles.kickerLight}>Ценность со временем</span>
                <h2>Не склад заметок. Живая карта того, что занимает ваши мысли.</h2>
                <p>
                  Отдельная рефлексия даёт ясность сегодня. История показывает,
                  что продолжает возвращаться и где размышление ещё не перешло
                  в движение.
                </p>
              </div>

              <div className={styles.benefitGrid}>
                {benefits.map((benefit) => (
                  <article className={styles.benefitCard} key={benefit.number}>
                    <span>{benefit.number}</span>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={`${styles.container} ${styles.trustSection}`} id="trust">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.kicker}>Спокойный AI</span>
                <h2>Личный дневник без роли психолога или начальника</h2>
              </div>
              <p>
                MindFlow помогает увидеть собственную мысль яснее, не подменяя
                её диагнозом, советом или чужой интерпретацией.
              </p>
            </div>

            <div className={styles.trustGrid}>
              {trustPoints.map((point) => (
                <article className={styles.trustCard} key={point.title}>
                  <span className={styles.check} aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <h3>{point.title}</h3>
                    <p>{point.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={`${styles.container} ${styles.finalCta}`}>
            <div className={styles.ctaBox}>
              <span className={styles.kickerLight}>Начните с того, что уже крутится в голове</span>
              <h2>Скажите одну мысль как есть. MindFlow поможет увидеть в ней главное.</h2>
              <p>
                После дня, прогулки или встречи — без подготовки и правильных
                формулировок.
              </p>
              <Link className={`${styles.button} ${styles.ctaButton}`} href="/app">
                Открыть MindFlow
              </Link>
            </div>
          </section>
        </main>

        <footer className={`${styles.container} ${styles.footer}`}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <MindFlowMark />
            </span>
            <span>MindFlow</span>
          </div>
          <p>Личный AI-дневник рефлексии</p>
        </footer>
      </div>
    </div>
  );
}

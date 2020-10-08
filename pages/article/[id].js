import gql from 'graphql-tag';
import Link from 'next/link';
import { useEffect, useRef, useCallback, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Box, Hidden, Snackbar } from '@material-ui/core';
import { ngettext, msgid, t } from 'ttag';

import { useRouter } from 'next/router';
import { useQuery, useLazyQuery } from '@apollo/react-hooks';
import Head from 'next/head';

import withData from 'lib/apollo';
import useCurrentUser from 'lib/useCurrentUser';
import { nl2br, linkify, ellipsis } from 'lib/text';
import { usePushToDataLayer } from 'lib/gtm';

import { format, formatDistanceToNow } from 'lib/dateWithLocale';
import isValid from 'date-fns/isValid';
import { LINE_URL } from 'constants/urls';

import AddIcon from '@material-ui/icons/AddCircleOutline';
import Fab from '@material-ui/core/Fab';
import AppLayout from 'components/AppLayout';
import Ribbon from 'components/Ribbon';
import { Card, CardHeader, CardContent } from 'components/Card';
import Hyperlinks from 'components/Hyperlinks';
import CurrentReplies from 'components/CurrentReplies';
import ReplyRequestReason from 'components/ReplyRequestReason';
import CreateReplyRequestForm from 'components/CreateReplyRequestForm';
import NewReplySection from 'components/NewReplySection';
import ArticleInfo from 'components/ArticleInfo';
import ArticleCategories from 'components/ArticleCategories';
import TrendPlot from 'components/TrendPlot';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    padding: '24px 0',
    flexDirection: 'column',
    [theme.breakpoints.up('md')]: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
  },
  textHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingRight: 'var(--card-px)',
  },
  title: {
    padding: '2px 12px',
    fontSize: 12,
    lineHeight: '20px',
    fontWeight: 700,
    [theme.breakpoints.up('md')]: {
      fontSize: 14,
      padding: '10px 28px',
    },
  },
  firstReported: {
    fontSize: 12,
    lineHeight: '20px',
    color: theme.palette.secondary[200],
    [theme.breakpoints.up('md')]: {
      fontSize: 14,
    },
  },
  main: {
    flex: 1,
    minWidth: 0,
    '& > *': {
      marginBottom: 12,
    },
    [theme.breakpoints.up('md')]: {
      flex: 3,
      marginRight: 12,
    },
  },
  aside: {
    [theme.breakpoints.up('md')]: {
      minWidth: 0,
      flex: 1,
      padding: '0 20px',
      background: theme.palette.background.paper,
      borderRadius: theme.shape.borderRadius,
    },
  },
  asideHeader: {
    lineHeight: '20px',
    padding: '12px 0',
    fontWeight: 700,
    [theme.breakpoints.up('md')]: {
      padding: '20px 0 12px',
      borderBottom: `1px solid ${theme.palette.secondary[500]}`,
    },
  },
  asideItems: {
    display: 'flex',
    flexFlow: 'row',
    overflowX: 'auto',

    '--gutter': `${theme.spacing(2)}px`,
    margin: `0 calc(-1 * var(--gutter))`,
    padding: `0 var(--gutter)`,

    '&::after': {
      // Right-most gutter after the last item
      content: '""',
      flex: '0 0 var(--gutter)',
    },

    [theme.breakpoints.up('sm')]: {
      '--gutter': `${theme.spacing(3)}px`,
    },
    [theme.breakpoints.up('md')]: {
      '--gutter': 0,
      flexFlow: 'column',
      overflowX: 'visible',
      '&::after': {
        display: 'none',
      },
    },
  },
  asideItem: {
    // override <a> defaults
    textDecoration: 'none',
    color: 'inherit',

    [theme.breakpoints.down('sm')]: {
      padding: 16,
      background: theme.palette.background.paper,
      borderRadius: theme.shape.borderRadius,
      flex: '0 0 320px',
      maxWidth: '66vw',
      '& + &': {
        marginLeft: 12,
      },
    },

    [theme.breakpoints.up('md')]: {
      padding: '16px 0',
      '& + &': {
        borderTop: `1px solid ${theme.palette.secondary[100]}`,
      },
    },
  },
  asideItemText: {
    display: '-webkit-box',
    overflow: 'hidden',
    boxOrient: 'vertical',
    textOverflow: 'ellipsis',
    lineClamp: 5,

    // distance between ArticleInfo
    marginBottom: 12,
  },
  lineFab: {
    position: 'fixed',
    zIndex: theme.zIndex.speedDial,
    right: 20,
    bottom: 20,
    background: theme.palette.common.green1,
    color: '#fff',
    height: 52,
    borderRadius: 32,

    '&:hover': {
      background: theme.palette.common.green2,
    },
  },
  lineFabText: {
    lineHeight: '20px',
    margin: '0 12px',
  },
  bannerImage: {
    width: '100%',
    borderRadius: theme.shape.borderRadius,
  },
}));

const LOAD_ARTICLE = gql`
  query LoadArticlePage($id: String!) {
    GetArticle(id: $id) {
      id
      text
      requestedForReply
      replyRequestCount
      replyCount
      createdAt
      references {
        type
      }
      hyperlinks {
        ...HyperlinkData
      }
      replyRequests {
        reason
        ...ReplyRequestInfo
      }
      articleReplies {
        ...CurrentRepliesData
      }
      ...RelatedArticleData
      similarArticles: relatedArticles {
        edges {
          node {
            id
            text
            ...ArticleInfo
          }
        }
      }
      articleCategories {
        ...ArticleCategoryData
        ...AddCategoryDialogData
      }
      stats {
        date
        webVisit
        lineVisit
      }
    }
  }
  ${Hyperlinks.fragments.HyperlinkData}
  ${ReplyRequestReason.fragments.ReplyRequestInfo}
  ${CurrentReplies.fragments.CurrentRepliesData}
  ${NewReplySection.fragments.RelatedArticleData}
  ${ArticleCategories.fragments.ArticleCategoryData}
  ${ArticleCategories.fragments.AddCategoryDialogData}
  ${ArticleInfo.fragments.articleInfo}
`;

const LOAD_ARTICLE_FOR_USER = gql`
  query LoadArticlePageForUser($id: String!) {
    GetArticle(id: $id) {
      id # Required, https://github.com/apollographql/apollo-client/issues/2510
      replyRequests {
        ...ReplyRequestInfoForUser
      }
      articleReplies {
        ...ArticleReplyForUser
      }
      articleCategories {
        ...ArticleCategoryDataForUser
        ...AddCategoryDialogData
      }
    }
  }
  ${ReplyRequestReason.fragments.ReplyRequestInfoForUser}
  ${CurrentReplies.fragments.ArticleReplyForUser}
  ${ArticleCategories.fragments.ArticleCategoryDataForUser}
  ${ArticleCategories.fragments.AddCategoryDialogData}
`;

function ArticlePage() {
  const { query } = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [flashMessage, setFlashMessage] = useState(0);
  const articleVars = { id: query.id };

  const { data, loading } = useQuery(LOAD_ARTICLE, {
    variables: articleVars,
  });
  const [
    loadArticleForUser,
    { refetch: refetchArticleForUser, called: articleForUserCalled },
  ] = useLazyQuery(LOAD_ARTICLE_FOR_USER, {
    variables: articleVars,
    fetchPolicy: 'network-only',
  });
  const currentUser = useCurrentUser();

  const replySectionRef = useRef(null);
  const newReplyRef = useRef(null);

  const classes = useStyles();

  // Load user field when currentUser changes
  useEffect(() => {
    if (!articleForUserCalled) {
      loadArticleForUser();
    } else {
      refetchArticleForUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleNewReplySubmit = useCallback(() => {
    setFlashMessage(t`Your reply has been submitted.`);

    // Wait for NewReplySection to collapse before scrolling to new reply
    setTimeout(() => {
      if (!replySectionRef.current) return;
      replySectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }, 0);
  }, []);

  const handleError = useCallback(error => {
    console.error(error);
    setFlashMessage(error.toString());
  }, []);

  const handleCopy = useCallback(e => {
    const selection = document.getSelection();
    const articleUrl = window.location.origin + window.location.pathname;

    e.clipboardData.setData(
      'text/plain',
      selection.toString() +
        `\n📋 節錄自 Cofacts 真的假的：${articleUrl}\n🤔 在 LINE 看到可疑訊息？加「真的假的」好友，查謠言與詐騙 ➡️ ${LINE_URL}`
    );
    e.preventDefault();
  }, []);

  const handleFormClose = () => setShowForm(false);

  const article = data?.GetArticle;

  usePushToDataLayer(!!article, { event: 'dataLoaded' });

  if (loading) {
    return (
      <AppLayout>
        <Head>
          <title>{t`Loading`}</title>
        </Head>
        <Card>
          <CardContent>{t`Loading`}...</CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (!article) {
    return (
      <AppLayout>
        <Head>
          <title>{t`Not found`}</title>
        </Head>
        <Card>
          <CardContent>{t`Message does not exist`}</CardContent>
        </Card>
      </AppLayout>
    );
  }

  const { replyRequestCount, text, hyperlinks, replyCount } = article;
  const similarArticles = article?.similarArticles?.edges || [];

  const createdAt = article.createdAt
    ? new Date(article.createdAt)
    : new Date();

  const timeAgoStr = formatDistanceToNow(createdAt);

  const replyRequestsWithComments = (article.replyRequests || []).filter(
    ({ reason }) => reason
  );

  return (
    <AppLayout>
      <Head>
        <title>
          {ellipsis(article.text, { wordCount: 100 })} | {t`Cofacts`}
        </title>
      </Head>
      <div className={classes.root}>
        <div className={classes.main}>
          <Card>
            <header className={classes.textHeader}>
              <Ribbon className={classes.title}>
                {ngettext(
                  msgid`${replyRequestCount} person report this message`,
                  `${replyRequestCount} people report this message`,
                  replyRequestCount
                )}
              </Ribbon>

              {isValid(createdAt) && (
                <span
                  className={classes.firstReported}
                  title={format(createdAt)}
                >
                  {t`First reported ${timeAgoStr} ago`}
                </span>
              )}
            </header>
            <CardContent>
              {nl2br(
                linkify(text, {
                  props: {
                    target: '_blank',
                  },
                })
              )}
              <Hyperlinks hyperlinks={hyperlinks} />
              <Box my={[1.5, 2]}>
                <ArticleCategories
                  articleId={article.id}
                  articleCategories={article.articleCategories.filter(
                    ({ status }) => status === 'NORMAL'
                  )}
                />
              </Box>
              <TrendPlot data={article.stats} />
            </CardContent>
            {replyRequestsWithComments.length > 0 ? (
              <>
                <CardHeader style={{ paddingTop: 0 }}>
                  {`Comments from people reporting this message`}
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                  {replyRequestsWithComments.map(replyRequest => (
                    <ReplyRequestReason
                      key={replyRequest.id}
                      articleId={article.id}
                      replyRequest={replyRequest}
                    />
                  ))}
                </CardContent>
              </>
            ) : null}
            <CreateReplyRequestForm
              requestedForReply={article.requestedForReply}
              articleId={article.id}
              onNewReplyButtonClick={() => {
                setShowForm(true);
                // use setTimeout to make sure the form has shown
                setTimeout(
                  () =>
                    newReplyRef.current.scrollIntoView({
                      behavior: 'smooth',
                    }),
                  0
                );
              }}
            />
          </Card>

          {showForm && (
            <div ref={newReplyRef}>
              <NewReplySection
                article={article}
                existingReplyIds={(article?.articleReplies || []).map(
                  ({ replyId }) => replyId
                )}
                relatedArticles={article?.relatedArticles}
                onSubmissionComplete={handleNewReplySubmit}
                onError={handleError}
                onClose={handleFormClose}
              />
            </div>
          )}

          <Card ref={replySectionRef} onCopy={handleCopy}>
            <CardHeader>
              {ngettext(
                msgid`There is ${replyCount} fact-checking reply to the message`,
                `There are ${replyCount} fact-checking replies to the message`,
                replyCount
              )}
            </CardHeader>
            <CurrentReplies articleReplies={article.articleReplies} />
          </Card>

          <Hidden smDown implementation="css">
            <a href={LINE_URL}>
              <img
                className={classes.bannerImage}
                src="/line-banner-desktop@2x.png"
                alt={t`Add Cofacts as friend in LINE`}
              />
            </a>
          </Hidden>
        </div>

        <aside className={classes.aside}>
          <header className={classes.asideHeader}>{t`Similar messages`}</header>
          {similarArticles.length ? (
            <div className={classes.asideItems}>
              {similarArticles.map(({ node }) => (
                <Link key={node.id} href={`/article/${node.id}`}>
                  <a className={classes.asideItem}>
                    <article className={classes.asideItemText}>
                      {node.text}
                    </article>
                    <ArticleInfo article={node} />
                  </a>
                </Link>
              ))}
            </div>
          ) : (
            <Box textAlign="center" pt={4} pb={3}>
              {t`No similar messages found`}
            </Box>
          )}
        </aside>
      </div>
      <Hidden mdUp implementation="css">
        <a href={LINE_URL}>
          <img
            className={classes.bannerImage}
            src="/line-banner-mobile@2x.png"
            alt={t`Add Cofacts as friend in LINE`}
            style={{ marginBottom: 24 }}
          />
        </a>
      </Hidden>
      <Snackbar
        open={!!flashMessage}
        onClose={() => setFlashMessage('')}
        message={flashMessage}
      />
      {!currentUser && (
        <Fab
          size="large"
          variant="extended"
          aria-label="Add friend"
          data-ga="Add LINE friend FAB"
          className={classes.lineFab}
          href={LINE_URL}
          target="_blank"
        >
          <AddIcon />
          <span className={classes.lineFabText}>
            LINE 機器人
            <br />
            查謠言詐騙
          </span>
        </Fab>
      )}
    </AppLayout>
  );
}

export default withData(ArticlePage);

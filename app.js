// Before Running this script on linux server run this command
// apt-get install chromium-browser

// Inside this project folder run these commands
// npm install
// npm run app

// Change .env.example to .env
// AND put your steam API key in the .env file
// You can get your own API key over here: https://steamcommunity.com/dev/apikey

const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const { Cluster } = require("puppeteer-cluster");
const SteamAPI = require("steamapi");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true }));
app.options("*", cors());
const port = 3000;

const steam = new SteamAPI(process.env.STEAM_API);

let screenShotsLength = 0;
let user_profile_url = "";

// user information
let user_nickname = "";
let user_avatar = "";
let user_steam_id = "";

app.get("/steam/screenshots/:id/", async (req, res) => {
  let id = req.params.id;

  async function getAllUserPhotos() {
    console.time("getAllUserPhotos");
    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_PAGE,
      maxConcurrency: 5,
      // workerCreationDelay: 1000,
      puppeteerOptions: {
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        ignoreDefaultArgs: ["--disable-extensions"],
        // executablePath: '/usr/bin/chromium-browser',
        // defaultViewport: null,
      },
    });

    let idsArray = [];
    let linksArray = [];
    let dataArray = [];
    let count_1 = -1;

    await cluster.task(async ({ page, data: url }) => {
      // get header link request
      page.on("request", (request) => {
        const rUrl = request.url();
        if (rUrl.includes("https://steamuserimages-a.akamaihd.net/ugc/")) {
          linksArray.push(rUrl);
        }
      });
      await page.goto(url, { waitUntil: "load" });

      await page.waitForSelector("div#tagsAlignBottom");

      // get game screenShot name
      const el_tag_name = await page.$("#tagsAlignBottom > p > a");
      let el_name = await page.evaluate((el) => el.innerText, el_tag_name);

      await page.waitForSelector("form#PublishedFileFavorite");

      // retuen data to idsArray array
      const scrap = await page.evaluate(() => {
        const form = Array.from(
          document.querySelectorAll("#PublishedFileFavorite")
        );
        return form.map((data) => ({
          appid: JSON.parse(data.querySelector("input[name=appid]").value),
          fileid: JSON.parse(data.querySelector("input[name=id]").value),
        }));
      });
      idsArray.push(...scrap);
      count_1++;

      dataArray.push({
        appid: idsArray[count_1].appid,
        game_name: el_name,
        publishedfileid: idsArray[count_1].fileid,
        screenshot: linksArray[count_1],
      });

      // test ...
      // res.write("dsadas");
    });

    for (const url of photoUrls) {
      await cluster.queue(url);
    }

    // Shutdown after everything is done
    await cluster.idle();
    await cluster.close();
    console.timeEnd("getAllUserPhotos");

    // The final data results
    return res.end(
      JSON.stringify(
        {
          success: true,
          message: "screenshots successfully found!",
          nickname: user_nickname,
          url: user_profile_url,
          avatar: user_avatar,
          steam_id: user_steam_id,
          screenshots_length: dataArray.length,
          screenshots: dataArray,
        },
        null,
        3
      )
    );
  }

  // ====================================================

  let photoUrls = [];

  // grapping all photos links from every url by photo id
  async function getUserPhotoUrls() {
    console.time("getUserPhotoUrls");
    puppeteer
      .launch({
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        ignoreDefaultArgs: ["--disable-extensions"],
        // executablePath: '/usr/bin/chromium-browser',
        // defaultViewport: null,
      })
      .then(async (browser) => {
        const page = await browser.newPage();
        await page.goto(
          `${user_profile_url}/screenshots/?sort=newestfirst&view=imagewall`,
          { waitUntil: "networkidle2" }
        );

        // loop until page ScreenShots = user full ScreenShots
        while (photoUrls.length < screenShotsLength) {
          photoUrls = await page.evaluate(() => {
            const images = Array.from(
              document.querySelectorAll(".profile_media_item")
            );
            return images.map((img) => `${img.href}&insideModal=1`);
          });

          // skip scrolling down if photos less then 12
          if (screenShotsLength > 12) {
            previousHeight = await page.evaluate("document.body.scrollHeight");
            await page.evaluate(
              "window.scrollTo(0, document.body.scrollHeight)"
            );
            await page.waitForFunction(
              `document.body.scrollHeight > ${previousHeight}`
            );
            await page.waitForSelector("#action_wait", { visible: false });
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        await browser.close();
        console.timeEnd("getUserPhotoUrls");

        // go to the next function
        getAllUserPhotos();
      });
  }

  // ====================================================

  // get user screenshots length
  function getUserPhotoLength() {
    console.time("getUserPhotoLength");
    puppeteer
      .launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        ignoreDefaultArgs: ["--disable-extensions"],
        // executablePath: '/usr/bin/chromium-browser',
      })
      .then(async (browser) => {
        const page = await browser.newPage();
        await page.goto(
          `${user_profile_url}/screenshots/?sort=newestfirst&view=grid`
        );

        // run this if there is number of screenshots on grid view
        if (
          await page.$(
            '#image_wall div[style="float:left; padding-bottom: 5px;"]'
          )
        ) {
          const el_total_p = await page.$(
            '#image_wall div[style="float:left; padding-bottom: 5px;"]'
          );
          screenShotsLength = await page.evaluate(
            (el) => JSON.parse(el.innerText.split(" of ")[1]),
            el_total_p
          );
          console.log("ScreenShots:", screenShotsLength);

          // go to the next function
          getUserPhotoUrls();
        } else {
          return res.end(
            JSON.stringify(
              {
                success: false,
                message: "no photos found or your profile is private",
                error_code: 2,
                screenshots: [null],
              },
              null,
              3
            )
          );
        }
        await browser.close();
        console.timeEnd("getUserPhotoLength");
      });
  }

  // ====================================================

  // extract data by user custom-URL
  function check_next_resolve() {
    steam
      .resolve(`https://steamcommunity.com/id/${id}`)
      .then((id) => {
        steam.getUserSummary(id).then((summary) => {
          if (summary.visibilityState === 1) {
            return res.end(
              JSON.stringify(
                {
                  success: false,
                  message: "steam id is private",
                  error_code: 1,
                  screenshots: [null],
                },
                null,
                3
              )
            );
          } else {
            user_profile_url = summary.url;
            user_nickname = summary.nickname;
            user_avatar = summary.avatar.large;
            user_steam_id = summary.steamID;

            // go to the next function
            getUserPhotoLength();
          }
        });
      })
      .catch((error) => {
        return res.end(
          JSON.stringify(
            {
              success: false,
              message: "steam id not found or the typing is incorrect",
              error_code: 3,
              screenshots: [null],
            },
            null,
            3
          )
        );
      });
  }

  // extract data by user steamID64
  steam
    .getUserSummary(id)
    .then((summary) => {
      if (summary.visibilityState === 1) {
        return res.end(
          JSON.stringify(
            {
              success: false,
              message: "steam id is private",
              error_code: 1,
              screenshots: [null],
            },
            null,
            3
          )
        );
      } else {
        user_profile_url = summary.url;
        user_nickname = summary.nickname;
        user_avatar = summary.avatar.large;
        user_steam_id = summary.steamID;

        // go to the next function
        getUserPhotoLength();
      }
    })
    .catch((error) => {
      check_next_resolve();
    });
});

app.get("/", (req, res) => {
  const frontPage = [
    "replace [user-id] with your steam id. > /steam/screenshots/[user-id]",
  ];
  res.send(frontPage);
});

// Redirect page
app.get("*", (req, res) => {
  res.redirect("/");
});

// start server and listen
app.listen(port);
